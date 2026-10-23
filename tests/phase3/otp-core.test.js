import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOtpService } from '../../src/app/auth/service/otp.core.js';

// in-memory cache with a fake clock, behaves like Redis for the commands we use
function makeCache() {
    let now = 0;
    const store = new Map();
    const alive = (k) => {
        const e = store.get(k);
        if (e && e.exp !== null && e.exp <= now) { store.delete(k); return undefined; }
        return e;
    };
    return {
        advance(seconds) { now += seconds * 1000; },
        async get(k) { return alive(k)?.value ?? null; },
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
            if (e.exp === null) return -1;
            return Math.ceil((e.exp - now) / 1000);
        },
    };
}

function build(config) {
    const cache = makeCache();
    const otp = createOtpService({ cache, secret: 's3cret', generateCode: () => '123456', config });
    return { cache, otp };
}

const status = (code) => (err) => err.statusCode === code;
const E = 'a@x.com';

test('issue returns a 6 digit code and only a hash is stored', async () => {
    const { cache, otp } = build();
    const code = await otp.issue({ email: E, purpose: 'verify' });
    assert.match(code, /^\d{6}$/);
    const stored = await cache.get(`otp:verify:${E}`);
    assert.notEqual(stored, code);
    assert.equal(stored.length, 64);
});

test('correct code verifies once, then it is gone (single use)', async () => {
    const { otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    assert.equal(await otp.verify({ email: E, purpose: 'verify', code: '123456' }), true);
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '123456' }), status(404));
});

test('wrong code -> 400, an email that never got a code -> 404', async () => {
    const { otp } = build();
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '123456' }), status(404));
    await otp.issue({ email: E, purpose: 'verify' });
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }), status(400));
});

test('garbage code input does not crash', async () => {
    const { otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: undefined }), status(400));
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: 123456 }), status(400));
});

test('5th wrong attempt -> 429 and the code is burned, even the right one fails after that', async () => {
    const { otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    for (let i = 0; i < 4; i++) {
        await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }), status(400));
    }
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }), status(429));
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '123456' }), status(404));
});

test('the right code still works on the 5th attempt', async () => {
    const { otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    for (let i = 0; i < 4; i++) {
        await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }));
    }
    assert.equal(await otp.verify({ email: E, purpose: 'verify', code: '123456' }), true);
});

test('issuing a new code resets the wrong-attempts counter', async () => {
    const { otp } = build({ cooldownSeconds: 0 });
    await otp.issue({ email: E, purpose: 'verify' });
    for (let i = 0; i < 3; i++) {
        await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }));
    }
    await otp.issue({ email: E, purpose: 'verify' });
    for (let i = 0; i < 4; i++) {
        await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '000000' }), status(400));
    }
});

test('a code is only valid for its own purpose', async () => {
    const { otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    await assert.rejects(() => otp.verify({ email: E, purpose: 'reset', code: '123456' }), status(404));
    assert.equal(await otp.verify({ email: E, purpose: 'verify', code: '123456' }), true);
});

test('a code is only valid for its own email, and email case does not matter', async () => {
    const { otp } = build();
    await otp.issue({ email: 'A@X.com', purpose: 'verify' });
    await assert.rejects(() => otp.verify({ email: 'b@x.com', purpose: 'verify', code: '123456' }), status(404));
    assert.equal(await otp.verify({ email: 'a@x.com', purpose: 'verify', code: '123456' }), true);
});

test('the code expires after ttlSeconds', async () => {
    const { cache, otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    cache.advance(181);
    await assert.rejects(() => otp.verify({ email: E, purpose: 'verify', code: '123456' }), status(404));
});

test('cooldown: a second code within 60s is refused, after 60s it is allowed', async () => {
    const { cache, otp } = build();
    await otp.issue({ email: E, purpose: 'verify' });
    await assert.rejects(() => otp.issue({ email: E, purpose: 'verify' }), status(429));
    cache.advance(61);
    await otp.issue({ email: E, purpose: 'verify' });
});

test('request cap: 3 codes per window, 4th is refused, allowed again after the window', async () => {
    const { cache, otp } = build({ cooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) await otp.issue({ email: E, purpose: 'verify' });
    await assert.rejects(() => otp.issue({ email: E, purpose: 'verify' }), status(429));
    cache.advance(901);
    await otp.issue({ email: E, purpose: 'verify' });
});

test('request cap is per email and per purpose', async () => {
    const { otp } = build({ cooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) await otp.issue({ email: E, purpose: 'verify' });
    await otp.issue({ email: E, purpose: 'reset' });
    await otp.issue({ email: 'other@x.com', purpose: 'verify' });
});

test('unknown purpose is a programming error, not a silent success', async () => {
    const { otp } = build();
    await assert.rejects(() => otp.issue({ email: E, purpose: 'nope' }), /invalid otp purpose/);
});