import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const { generateToken } = await import('../../src/app/auth/utils/token.js');
const { hashPassword, comparePassword } = await import('../../src/app/auth/utils/hash.js');
const { buildCookieOptions } = await import('../../src/app/auth/utils/cookie.js');
const { env } = await import('../../src/lib/config/env.js');

test('token lifetime is expiresInSeconds (not ~41 days) and it carries a jti', () => {
    const decoded = jwt.decode(generateToken({ id: 'u1' }), { complete: true });
    assert.equal(decoded.header.alg, 'HS256');
    assert.equal(decoded.payload.exp - decoded.payload.iat, env.jwt.expiresInSeconds);
    assert.ok(decoded.payload.exp - decoded.payload.iat < 86400);
    assert.ok(decoded.payload.jti);
});

test('every token has a different jti', () => {
    const a = jwt.decode(generateToken({ id: 'u1' })).jti;
    const b = jwt.decode(generateToken({ id: 'u1' })).jti;
    assert.notEqual(a, b);
});

test('a token verifies only with HS256 and the right secret', () => {
    const token = generateToken({ id: 'u1' });
    assert.equal(jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }).id, 'u1');
    assert.throws(() => jwt.verify(token, 'wrong', { algorithms: ['HS256'] }));
});

test('hashPassword uses cost 12 and compare works', async () => {
    const hash = await hashPassword('12345678');
    assert.equal(bcrypt.getRounds(hash), 12);
    assert.equal(await comparePassword('12345678', hash), true);
    assert.equal(await comparePassword('wrong-pass', hash), false);
});

test('old cost-10 hashes still verify', async () => {
    const old = await bcrypt.hash('12345678', 10);
    assert.equal(await comparePassword('12345678', old), true);
});

test('password above 72 bytes is rejected with 400', async () => {
    await assert.rejects(
        () => hashPassword('a'.repeat(73)),
        (err) => err.statusCode === 400
    );
});

test('cookie options', () => {
    assert.deepEqual(
        buildCookieOptions({ secure: true, sameSite: 'lax', maxAgeSeconds: 3600 }),
        { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600000 }
    );
    assert.equal('maxAge' in buildCookieOptions({ secure: false, sameSite: 'lax' }), false);
});