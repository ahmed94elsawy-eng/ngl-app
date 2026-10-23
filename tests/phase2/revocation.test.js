import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevocation } from '../../src/lib/auth/revocation.core.js';

const NOW_MS = 1_000_000_000_000;
const NOW_S = NOW_MS / 1000;

function makeCache(overrides = {}) {
    const store = new Map();
    return { store, calls: [], async get(k) { return store.get(k) ?? null; },
        async set(k, v, ttl) { this.calls.push({ k, v, ttl }); store.set(k, v); }, ...overrides };
}

test('revoke stores the jti for exactly the remaining lifetime', async () => {
    const cache = makeCache();
    const { revoke, isRevoked } = createRevocation(cache, () => NOW_MS);
    assert.equal(await revoke({ jti: 'a', exp: NOW_S + 100 }), true);
    assert.equal(cache.calls[0].ttl, 100);
    assert.equal(await isRevoked('a'), true);
    assert.equal(await isRevoked('b'), false);
});

test('an already expired token is not stored', async () => {
    const cache = makeCache();
    const { revoke } = createRevocation(cache, () => NOW_MS);
    assert.equal(await revoke({ jti: 'a', exp: NOW_S - 1 }), false);
    assert.equal(cache.calls.length, 0);
});

test('revoke without jti does nothing (old tokens)', async () => {
    const cache = makeCache();
    const { revoke } = createRevocation(cache, () => NOW_MS);
    assert.equal(await revoke({ exp: NOW_S + 100 }), false);
    assert.equal(cache.calls.length, 0);
});

test('isRevoked is fail-open when the cache is down', async () => {
    const cache = makeCache({ get: async () => { throw new Error('redis down'); } });
    const { isRevoked } = createRevocation(cache, () => NOW_MS);
    assert.equal(await isRevoked('a'), false);
});

test('revoke propagates the error when the cache is down (logout must not pretend to succeed)', async () => {
    const cache = makeCache({ set: async () => { throw new Error('redis down'); } });
    const { revoke } = createRevocation(cache, () => NOW_MS);
    await assert.rejects(() => revoke({ jti: 'a', exp: NOW_S + 100 }));
});