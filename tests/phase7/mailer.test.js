import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, maskEmail } from '../../src/lib/email/mailer.core.js';

const flush = () => new Promise((r) => setTimeout(r, 20));

function build(sendMail, opts = {}) {
    const logs = [];
    const logger = {
        error: (m, meta) => logs.push(['error', m, meta]),
        info: (m, meta) => logs.push(['info', m, meta]),
    };
    const mailer = createMailer({ provider: { sendMail }, logger, sleep: async () => {}, ...opts });
    return { mailer, logs };
}

test('maskEmail hides most of the address', () => {
    assert.equal(maskEmail('ahmed@x.com'), 'a***@x.com');
});

test('deliver returns the provider answer on success', async () => {
    const { mailer, logs } = build(async () => ({ ok: 1 }));
    assert.deepEqual(await mailer.deliver('a@x.com', 's', 'h'), { ok: 1 });
    assert.equal(logs.length, 0);
});

test('sendInBackground returns immediately and does not wait for the provider', () => {
    const { mailer } = build(() => new Promise(() => {})); // never finishes
    assert.equal(mailer.sendInBackground('a@x.com', 's', 'h'), undefined);
});

test('one failure is retried and then succeeds without an error log', async () => {
    let calls = 0;
    const { mailer, logs } = build(async () => {
        if (++calls === 1) throw new Error('mailjet down');
        return { ok: 1 };
    });
    assert.deepEqual(await mailer.deliver('a@x.com', 's', 'h'), { ok: 1 });
    assert.equal(calls, 2);
    assert.equal(logs.some(([level]) => level === 'error'), false);
});

test('all attempts failing: returns null, logs one error, never throws', async () => {
    let calls = 0;
    const { mailer, logs } = build(async () => { calls++; throw new Error('mailjet down'); });
    assert.equal(await mailer.deliver('ahmed@x.com', 'subj', 'h'), null);
    assert.equal(calls, 2);
    const errors = logs.filter(([level]) => level === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0][2].to, 'a***@x.com'); // full address is not logged
});

test('a failing background send causes no unhandled rejection', async () => {
    let unhandled = false;
    const onUnhandled = () => { unhandled = true; };
    process.on('unhandledRejection', onUnhandled);
    try {
        const { mailer, logs } = build(async () => { throw new Error('down'); });
        mailer.sendInBackground('a@x.com', 's', 'h');
        await flush();
        assert.equal(unhandled, false);
        assert.equal(logs.filter(([level]) => level === 'error').length, 1);
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

test('attempts is configurable', async () => {
    let calls = 0;
    const { mailer } = build(async () => { calls++; throw new Error('x'); }, { attempts: 3 });
    await mailer.deliver('a@x.com', 's', 'h');
    assert.equal(calls, 3);
});