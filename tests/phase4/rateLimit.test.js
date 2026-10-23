import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRateLimiter } from '../../src/lib/rate-limit/rateLimit.core.js';

// in-memory cache with a fake clock, behaves like Redis for the commands we use
function makeCache(overrides = {}) {
    let now = 0;
    const store = new Map();
    const alive = (k) => {
        const e = store.get(k);
        if (e && e.exp !== null && e.exp <= now) { store.delete(k); return undefined; }
        return e;
    };
    return {
        advance(s) { now += s * 1000; },
        value(k) { return alive(k) ? Number(alive(k).value) : undefined; },
        async incr(k) {
            const e = alive(k);
            const n = Number(e?.value ?? 0) + 1;
            store.set(k, { value: String(n), exp: e?.exp ?? null });
            return n;
        },
        async decr(k) {
            const e = alive(k);
            const n = Number(e?.value ?? 0) - 1;
            store.set(k, { value: String(n), exp: e?.exp ?? null });
            return n;
        },
        async expire(k, s) { const e = alive(k); if (!e) return 0; e.exp = now + s * 1000; return 1; },
        async ttl(k) {
            const e = alive(k);
            if (!e) return -2;
            return e.exp === null ? -1 : Math.ceil((e.exp - now) / 1000);
        },
        ...overrides,
    };
}

function makeRes() {
    const r = new EventEmitter();
    r.statusCode = 200;
    r.headers = {};
    r.setHeader = (k, v) => { r.headers[k] = v; };
    return r;
}

async function run(mw, req, res = makeRes()) {
    let arg = 'not-called';
    await mw(req, res, (e) => { arg = e; });
    return { arg, res };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const ip = (req) => req.ip;

test('requests under the limit pass, the next one gets 429 with Retry-After', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 3, windowSeconds: 60, key: ip }] });
    for (let i = 0; i < 3; i++) {
        const { arg } = await run(mw, { ip: '1.1.1.1' });
        assert.equal(arg, undefined);
    }
    const { arg, res } = await run(mw, { ip: '1.1.1.1' });
    assert.equal(arg.statusCode, 429);
    assert.equal(arg.isOperational, true);
    assert.equal(res.headers['Retry-After'], '60');
});

test('the counter resets after the window', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 1, windowSeconds: 60, key: ip }] });
    await run(mw, { ip: 'a' });
    assert.equal((await run(mw, { ip: 'a' })).arg.statusCode, 429);
    cache.advance(61);
    assert.equal((await run(mw, { ip: 'a' })).arg, undefined);
});

test('Retry-After counts down with the remaining time of the window', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 1, windowSeconds: 60, key: ip }] });
    await run(mw, { ip: 'a' });
    cache.advance(40);
    const { res } = await run(mw, { ip: 'a' });
    assert.equal(res.headers['Retry-After'], '20');
});

test('different IPs have independent counters', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 1, windowSeconds: 60, key: ip }] });
    await run(mw, { ip: 'a' });
    assert.equal((await run(mw, { ip: 'a' })).arg.statusCode, 429);
    assert.equal((await run(mw, { ip: 'b' })).arg, undefined);
});

test('the strictest of several rules wins, and rules do not mix across keys', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({
        name: 't',
        rules: [
            { scope: 'ip', limit: 10, windowSeconds: 60, key: ip },
            { scope: 'ip-email', limit: 2, windowSeconds: 60, key: (r) => `${r.ip}:${r.body.email}` },
        ],
    });
    await run(mw, { ip: 'a', body: { email: 'x@x.com' } });
    await run(mw, { ip: 'a', body: { email: 'x@x.com' } });
    assert.equal((await run(mw, { ip: 'a', body: { email: 'x@x.com' } })).arg.statusCode, 429);
    // same IP, another email: still allowed
    assert.equal((await run(mw, { ip: 'a', body: { email: 'y@x.com' } })).arg, undefined);
});

test('a rule whose key is null is skipped', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({
        name: 't',
        rules: [{ scope: 'email', limit: 1, windowSeconds: 60, key: () => null }],
    });
    for (let i = 0; i < 5; i++) assert.equal((await run(mw, { ip: 'a' })).arg, undefined);
});

test('skipSuccessful: successful responses are given back, failures count', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({
        name: 't', skipSuccessful: true,
        rules: [{ scope: 'ip', limit: 2, windowSeconds: 60, key: ip }],
    });

    // 5 successful logins never block
    for (let i = 0; i < 5; i++) {
        const res = makeRes();
        const { arg } = await run(mw, { ip: 'ok' }, res);
        assert.equal(arg, undefined);
        res.statusCode = 200;
        res.emit('finish');
        await tick();
    }

    // failed logins do
    for (let i = 0; i < 2; i++) {
        const res = makeRes();
        await run(mw, { ip: 'bad' }, res);
        res.statusCode = 401;
        res.emit('finish');
        await tick();
    }
    assert.equal((await run(mw, { ip: 'bad' })).arg.statusCode, 429);
});

test('skipSuccessful: a blocked request is not given back', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({
        name: 't', skipSuccessful: true,
        rules: [{ scope: 'ip', limit: 1, windowSeconds: 60, key: ip }],
    });
    await run(mw, { ip: 'a' });
    const res = makeRes();
    await run(mw, { ip: 'a' }, res);
    res.statusCode = 429;
    res.emit('finish');
    await tick();
    assert.equal(cache.value('rl:t:ip:a'), 2);
});

test('fail-open: a cache error lets the request through', async () => {
    const cache = makeCache({ incr: async () => { throw new Error('redis down'); } });
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 1, windowSeconds: 60, key: ip }] });
    for (let i = 0; i < 3; i++) assert.equal((await run(mw, { ip: 'a' })).arg, undefined);
});

test('a counter that lost its TTL gets one again (no permanent block)', async () => {
    const cache = makeCache();
    await cache.incr('rl:t:ip:a'); // INCR happened but the process died before EXPIRE
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 5, windowSeconds: 60, key: ip }] });
    await run(mw, { ip: 'a' });
    assert.equal(await cache.ttl('rl:t:ip:a'), 60);
});

test('RateLimit-Remaining is reported', async () => {
    const cache = makeCache();
    const mw = createRateLimiter(cache)({ name: 't', rules: [{ scope: 'ip', limit: 3, windowSeconds: 60, key: ip }] });
    const { res } = await run(mw, { ip: 'a' });
    assert.equal(res.headers['RateLimit-Remaining'], '2');
});