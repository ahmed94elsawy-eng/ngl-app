import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MailjetProvider } from '../../src/pkg/email/mailjet.js';

function makeProvider(request) {
    const provider = new MailjetProvider({
        apiKey: 'k', apiSecret: 's', fromEmail: 'from@x.com', fromName: 'NGL'
    });
    provider.client = { post: () => ({ request }) };
    return provider;
}

test('sendMail resolves with the Mailjet response on success', async () => {
    const provider = makeProvider(async () => ({ body: 'ok' }));
    const res = await provider.sendMail('to@x.com', 'subject', '<p>hi</p>');
    assert.deepEqual(res, { body: 'ok' });
});

test('sendMail sends the expected message', async () => {
    let payload;
    const provider = makeProvider(async (p) => { payload = p; return {}; });
    await provider.sendMail('to@x.com', 'subject', '<p>hi</p>');
    const msg = payload.Messages[0];
    assert.equal(msg.To[0].Email, 'to@x.com');
    assert.equal(msg.From.Email, 'from@x.com');
    assert.equal(msg.Subject, 'subject');
});

test('sendMail rejects with a 502 AppError when Mailjet fails (no unhandled rejection)', async () => {
    const provider = makeProvider(async () => { throw new Error('mailjet down'); });
    await assert.rejects(
        () => provider.sendMail('to@x.com', 's', 'h'),
        (err) => err.statusCode === 502 && err.isOperational === true
    );
});