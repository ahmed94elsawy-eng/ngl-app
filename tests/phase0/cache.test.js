import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWithCache } from '../../src/lib/cache/withCache.core.js';

const tick = () => new Promise((r) => setImmediate(r));

function makeRes(statusCode = 200) {
    return {
        statusCode, headers: {}, body: undefined,
        setHeader(k, v) { this.headers[k] = v; },
        json(b) { this.body = b; return this; },
    };
}

function makeProvider(overrides = {}) {
    const store = new Map();
    return {
        store, getCalls: 0,
        async get(k) { this.getCalls++; return store.get(k) ?? null; },
        async set(k, v) { store.set(k, v); },
        ...overrides,
    };
}

const req = (method = 'GET') => ({ method, originalUrl: '/x' });

test('MISS: stores a 2xx body and marks the response', async () => {
    const provider = makeProvider();
    const mw = createWithCache(provider)(60);
    const res = makeRes();
    let called = false;
    await mw(req(), res, () => { called = true; });
    assert.equal(called, true);
    res.json({ a: 1 });
    await tick();
    assert.equal(res.headers['X-Cache'], 'MISS');
    assert.equal(provider.store.get('GET:/x'), JSON.stringify({ a: 1 }));
});

test('HIT: answers from cache without calling next', async () => {
    const provider = makeProvider();
    provider.store.set('GET:/x', JSON.stringify({ cached: true }));
    const mw = createWithCache(provider)();
    const res = makeRes();
    let called = false;
    await mw(req(), res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.headers['X-Cache'], 'HIT');
    assert.deepEqual(res.body, { cached: true });
});

test('non-2xx responses are delivered and not cached (no hanging request)', async () => {
    const provider = makeProvider();
    const mw = createWithCache(provider)();
    const res = makeRes(500);
    await mw(req(), res, () => {});
    res.json({ error: 'boom' });
    await tick();
    assert.deepEqual(res.body, { error: 'boom' });
    assert.equal(provider.store.size, 0);
});

test('fail-open: cache read error still calls next', async () => {
    const provider = makeProvider({ get: async () => { throw new Error('redis down'); } });
    const mw = createWithCache(provider)();
    let called = false;
    await mw(req(), makeRes(), () => { called = true; });
    assert.equal(called, true);
});

test('fail-open: corrupted cached value is ignored', async () => {
    const provider = makeProvider();
    provider.store.set('GET:/x', '{not json');
    const mw = createWithCache(provider)();
    let called = false;
    await mw(req(), makeRes(), () => { called = true; });
    assert.equal(called, true);
});

test('cache write failure does not break the response or crash the process', async () => {
    const provider = makeProvider({ set: async () => { throw new Error('redis down'); } });
    const mw = createWithCache(provider)();
    const res = makeRes();
    await mw(req(), res, () => {});
    res.json({ a: 1 });
    await tick();
    assert.deepEqual(res.body, { a: 1 });
});

test('non-GET requests bypass the cache', async () => {
    const provider = makeProvider();
    const mw = createWithCache(provider)();
    let called = false;
    await mw(req('POST'), makeRes(), () => { called = true; });
    assert.equal(called, true);
    assert.equal(provider.getCalls, 0);
});