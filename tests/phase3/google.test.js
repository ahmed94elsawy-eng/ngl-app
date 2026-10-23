import '../phase2/setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createGoogleVerifier } = await import('../../src/lib/utils/google-auth.js');

const fakeClient = (impl) => ({ verifyIdToken: impl });
const audience = ['web-id'];

test('valid token returns the payload and passes the audience to Google', async () => {
    let received;
    const verify = createGoogleVerifier({
        audience,
        client: fakeClient(async (args) => {
            received = args;
            return { getPayload: () => ({ email: 'a@x.com', email_verified: true, name: 'Ahmed' }) };
        }),
    });
    const payload = await verify('tok');
    assert.equal(payload.email, 'a@x.com');
    assert.deepEqual(received, { idToken: 'tok', audience });
});

test('email_verified false -> 401', async () => {
    const verify = createGoogleVerifier({
        audience,
        client: fakeClient(async () => ({ getPayload: () => ({ email: 'a@x.com', email_verified: false }) })),
    });
    await assert.rejects(() => verify('tok'), (e) => e.statusCode === 401);
});

test('email_verified missing or payload without email -> 401', async () => {
    for (const payload of [{ email: 'a@x.com' }, { email_verified: true }, undefined]) {
        const verify = createGoogleVerifier({
            audience,
            client: fakeClient(async () => ({ getPayload: () => payload })),
        });
        await assert.rejects(() => verify('tok'), (e) => e.statusCode === 401);
    }
});

test('Google rejecting the token -> 401 (not a 500)', async () => {
    const verify = createGoogleVerifier({
        audience,
        client: fakeClient(async () => { throw new Error('Wrong recipient'); }),
    });
    await assert.rejects(() => verify('tok'), (e) => e.statusCode === 401 && e.isOperational === true);
});

test('missing idToken -> 400 and Google is never called', async () => {
    let called = false;
    const verify = createGoogleVerifier({ audience, client: fakeClient(async () => { called = true; }) });
    for (const bad of [undefined, null, '', 123, {}]) {
        await assert.rejects(() => verify(bad), (e) => e.statusCode === 400);
    }
    assert.equal(called, false);
});