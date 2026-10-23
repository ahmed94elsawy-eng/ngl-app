import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginLock, lockedError } from '../../src/app/auth/service/loginLock.core.js';

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
        async set(k, v, ttl) { store.set(k, { value: String(v), exp: ttl ? now + ttl * 1000 : null }); },
        async del(k) { store.delete(k); },
        async incr(k) {
            const e = alive(k);
            const n = Number(e?.value ?? 0) + 1;
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

const logger = { error() {}, info() {} };
const build = (over) => {
    const cache = makeCache(over);
    return { cache, lock: createLoginLock({ cache, logger }) };
};
const E = 'a@x.com';

test('4 failures do not ban, the 5th bans for 300 seconds', async () => {
    const { lock } = build();
    for (let i = 0; i < 4; i++) assert.equal(await lock.recordFailure(E), 0);
    await lock.assertNotLocked(E); // still allowed
    assert.equal(await lock.recordFailure(E), 300);
    await assert.rejects(() => lock.assertNotLocked(E), (e) => e.statusCode === 429 && e.isOperational === true);
});

test('the ban lasts 5 minutes, then the account can try again with a fresh counter', async () => {
    const { cache, lock } = build();
    for (let i = 0; i < 5; i++) await lock.recordFailure(E);
    cache.advance(299);
    await assert.rejects(() => lock.assertNotLocked(E), (e) => e.statusCode === 429);
    cache.advance(2);
    await lock.assertNotLocked(E);
    // the failure counter was cleared by the ban: 4 more failures don't ban again
    for (let i = 0; i < 4; i++) assert.equal(await lock.recordFailure(E), 0);
});

test('the remaining time is reported', async () => {
    const { cache, lock } = build();
    for (let i = 0; i < 5; i++) await lock.recordFailure(E);
    cache.advance(100);
    await assert.rejects(() => lock.assertNotLocked(E), (e) => /200 seconds/.test(e.message));
    assert.match(lockedError(5).message, /5 seconds/);
});

test('a successful login resets the consecutive counter', async () => {
    const { lock } = build();
    for (let i = 0; i < 4; i++) await lock.recordFailure(E);
    await lock.recordSuccess(E);
    for (let i = 0; i < 4; i++) assert.equal(await lock.recordFailure(E), 0);
});

test('failures older than the window are forgotten', async () => {
    const { cache, lock } = build();
    for (let i = 0; i < 4; i++) await lock.recordFailure(E);
    cache.advance(901);
    assert.equal(await lock.recordFailure(E), 0); // counts as the first one again
});

test('accounts are independent and the email is case-insensitive', async () => {
    const { lock } = build();
    for (let i = 0; i < 5; i++) await lock.recordFailure('A@X.com');
    await assert.rejects(() => lock.assertNotLocked('a@x.com'), (e) => e.statusCode === 429);
    await lock.assertNotLocked('other@x.com');
});

test('fail-open: a cache error never blocks logins', async () => {
    const down = async () => { throw new Error('redis down'); };
    const { lock } = build({ ttl: down, incr: down, del: down });
    await lock.assertNotLocked(E);
    assert.equal(await lock.recordFailure(E), 0);
    await lock.recordSuccess(E);
});