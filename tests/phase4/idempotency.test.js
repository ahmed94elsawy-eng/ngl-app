import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createIdempotency } from '../../src/lib/idempotency/idempotency.core.js';

const flush = () => new Promise((r) => setTimeout(r, 10));
const KEY = 'a1b2c3d4-key-0001';

function makeCache(overrides = {}) {
    const store = new Map();
    return {
        store,
        async get(k) { return store.get(k) ?? null; },
        async set(k, v) { store.set(k, v); },
        async del(k) { store.delete(k); },
        async setIfAbsent(k, v) { if (store.has(k)) return false; store.set(k, v); return true; },
        ...overrides,
    };
}

function makeRes() {
    const r = new EventEmitter();
    r.statusCode = 200;
    r.headers = {};
    r.body = undefined;
    r.sent = false;
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; r.sent = true; return r; };
    return r;
}

const makeReq = (over = {}) => ({
    method: 'PATCH',
    originalUrl: '/api/auth/reset-password',
    ip: '1.1.1.1',
    body: { email: 'a@x.com', newPassword: '12345678' },
    headers: { 'idempotency-key': KEY },
    ...over,
});

async function run(mw, req, res = makeRes()) {
    let arg = 'not-called';
    await mw(req, res, (e) => { arg = e; });
    return { arg, res };
}

const build = (cache, opts) => createIdempotency(cache)(opts);

test('without the header: passes untouched, or 400 when required', async () => {
    const cache = makeCache();
    const noHeader = makeReq({ headers: {} });
    assert.equal((await run(build(cache), noHeader)).arg, undefined);
    assert.equal(cache.store.size, 0);
    assert.equal((await run(build(cache, { required: true }), noHeader)).arg.statusCode, 400);
});

test('malformed keys are rejected with 400', async () => {
    const cache = makeCache();
    for (const bad of ['short', 'has spaces in it!!', 'x'.repeat(129), ['a', 'b']]) {
        const { arg } = await run(build(cache), makeReq({ headers: { 'idempotency-key': bad } }));
        assert.equal(arg.statusCode, 400);
    }
});

test('first request runs, its success is stored, a retry gets the same status and body without running again', async () => {
    const cache = makeCache();
    const mw = build(cache);

    const res1 = makeRes();
    assert.equal((await run(mw, makeReq(), res1)).arg, undefined);
    res1.statusCode = 201;
    res1.json({ done: true });
    await flush();
    assert.equal(res1.sent, true);

    const res2 = makeRes();
    const { arg } = await run(mw, makeReq(), res2);
    assert.equal(arg, 'not-called');
    assert.equal(res2.statusCode, 201);
    assert.deepEqual(res2.body, { done: true });
    assert.equal(res2.headers['Idempotency-Replayed'], 'true');
});

test('same key while the first request is still running -> 409', async () => {
    const cache = makeCache();
    const mw = build(cache);
    await run(mw, makeReq(), makeRes()); // first one never answers yet
    const { arg } = await run(mw, makeReq());
    assert.equal(arg.statusCode, 409);
});

test('same key with a different body -> 422', async () => {
    const cache = makeCache();
    const mw = build(cache);
    const res1 = makeRes();
    await run(mw, makeReq(), res1);
    res1.json({ ok: 1 });
    await flush();
    const { arg } = await run(mw, makeReq({ body: { email: 'a@x.com', newPassword: 'another-pass' } }));
    assert.equal(arg.statusCode, 422);
});

test('a failed request frees the key so the client can retry', async () => {
    const cache = makeCache();
    const mw = build(cache);
    const res1 = makeRes();
    await run(mw, makeReq(), res1);
    res1.statusCode = 400;
    res1.json({ message: 'bad code' });
    await flush();
    assert.equal(res1.sent, true);
    assert.equal(cache.store.size, 0);
    assert.equal((await run(mw, makeReq())).arg, undefined);
});

test('client disconnect frees the lock', async () => {
    const cache = makeCache();
    const mw = build(cache);
    const res1 = makeRes();
    await run(mw, makeReq(), res1);
    assert.equal(cache.store.size, 1);
    res1.emit('close');
    await flush();
    assert.equal(cache.store.size, 0);
});

test('the key is scoped: another user or another IP never sees the stored answer', async () => {
    const cache = makeCache();
    const mw = build(cache);
    const res1 = makeRes();
    await run(mw, makeReq({ user: { id: 'u1' } }), res1);
    res1.json({ secret: 'u1-data' });
    await flush();

    const { arg } = await run(mw, makeReq({ user: { id: 'u2' } }));
    assert.equal(arg, undefined); // runs normally, not a replay
    assert.equal((await run(mw, makeReq({ ip: '9.9.9.9' }))).arg, undefined);
});

test('the same key on another URL is a different operation', async () => {
    const cache = makeCache();
    const mw = build(cache);
    const res1 = makeRes();
    await run(mw, makeReq(), res1);
    res1.json({ ok: 1 });
    await flush();
    assert.equal((await run(mw, makeReq({ originalUrl: '/api/other' }))).arg, undefined);
});

test('fail-open when the lock cannot be taken (cache down)', async () => {
    const cache = makeCache({ setIfAbsent: async () => { throw new Error('redis down'); } });
    const res = makeRes();
    const { arg } = await run(build(cache), makeReq(), res);
    assert.equal(arg, undefined);
    res.json({ ok: 1 });
    await flush();
    assert.equal(res.sent, true);
});

test('a save failure still sends the response', async () => {
    const cache = makeCache({ set: async () => { throw new Error('redis down'); } });
    const res = makeRes();
    await run(build(cache), makeReq(), res);
    res.json({ ok: 1 });
    await flush();
    assert.equal(res.sent, true);
    assert.deepEqual(res.body, { ok: 1 });
});