import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthGuard } from '../../src/lib/auth/guard.core.js';

const NOW = Math.floor(Date.now() / 1000);

function build(overrides = {}) {
    return createAuthGuard({
        verifyToken: () => ({ id: 'u1', name: 'Ahmed', jti: 'j1', iat: NOW - 10, exp: NOW + 3000 }),
        findUserById: async () => ({ _id: 'u1' }),
        isRevoked: async () => false,
        ...overrides,
    });
}

async function run(guard, cookies = { access_token: 't' }) {
    const req = { cookies };
    let nextArg = 'not-called';
    await guard(req, {}, (e) => { nextArg = e; });
    return { req, nextArg };
}

test('no cookie -> 401', async () => {
    const { nextArg } = await run(build(), {});
    assert.equal(nextArg.statusCode, 401);
});

test('invalid/expired token error is passed to the error handler', async () => {
    const err = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const { nextArg } = await run(build({ verifyToken: () => { throw err; } }));
    assert.equal(nextArg, err);
});

test('revoked token -> 401', async () => {
    const { nextArg } = await run(build({ isRevoked: async () => true }));
    assert.equal(nextArg.statusCode, 401);
});

test('deleted or missing user -> 401', async () => {
    const { nextArg } = await run(build({ findUserById: async () => null }));
    assert.equal(nextArg.statusCode, 401);
});

test('token issued before changeCredentialsTime -> 401', async () => {
    const guard = build({ findUserById: async () => ({ changeCredentialsTime: new Date((NOW - 5) * 1000) }) });
    const { nextArg } = await run(guard);
    assert.equal(nextArg.statusCode, 401);
});

test('token issued after changeCredentialsTime -> allowed', async () => {
    const guard = build({ findUserById: async () => ({ changeCredentialsTime: new Date((NOW - 100) * 1000) }) });
    const { req, nextArg } = await run(guard);
    assert.equal(nextArg, undefined);
    assert.equal(req.user.id, 'u1');
});

test('valid token sets req.user and calls next() without error', async () => {
    const { req, nextArg } = await run(build());
    assert.equal(nextArg, undefined);
    assert.equal(req.user.jti, 'j1');
});

test('old token without jti is still accepted and the revocation check is skipped', async () => {
    let checked = false;
    const guard = build({
        verifyToken: () => ({ id: 'u1', iat: NOW - 10, exp: NOW + 100 }),
        isRevoked: async () => { checked = true; return true; },
    });
    const { nextArg } = await run(guard);
    assert.equal(nextArg, undefined);
    assert.equal(checked, false);
});