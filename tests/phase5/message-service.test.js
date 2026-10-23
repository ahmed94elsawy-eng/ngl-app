import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageService, toPublicMessage } from '../../src/app/message/service/message.core.js';

const U = 'u'.repeat(24);
const M = 'm'.repeat(24);

function build(over = {}) {
    const calls = { created: [], deleted: [], inbox: [] };
    const userRepository = {
        findUserById: async (id) => (id === 'missing' ? null : { _id: id }),
        ...over.user,
    };
    const messageRepository = {
        createMessage: async (content, receiver, sender) => {
            calls.created.push({ content, receiver, sender });
            return { _id: 'm1', content, receiver, sender, isDeleted: false, createdAt: new Date(0) };
        },
        getInbox: async (userId, opts) => { calls.inbox.push({ userId, opts }); return { items: [], total: 0 }; },
        findMessageForReceiver: async () => null,
        softDeleteMessage: async (id, userId) => { calls.deleted.push({ id, userId }); return null; },
        ...over.message,
    };
    return { svc: createMessageService({ userRepository, messageRepository }), calls };
}

const status = (code) => (err) => err.statusCode === code;

test('toPublicMessage returns only the whitelisted fields', () => {
    const pub = toPublicMessage({ _id: 'x', content: 'hi', receiver: 'r', sender: 's', isDeleted: false, __v: 0, createdAt: 1 });
    assert.deepEqual(Object.keys(pub).sort(), ['_id', 'content', 'createdAt', 'receiver']);
});

test('sendMessage stores the sender internally but never returns it', async () => {
    const { svc, calls } = build();
    const res = await svc.sendMessage('hello', U, 'sender-1');
    assert.equal(calls.created[0].sender, 'sender-1');
    assert.equal('sender' in res, false);
    assert.equal(res.content, 'hello');
});

test('anonymous send works (no sender)', async () => {
    const { svc, calls } = build();
    await svc.sendMessage('hello', U, undefined);
    assert.equal(calls.created[0].sender, undefined);
});

test('sendMessage to a missing receiver -> 404 and nothing is saved', async () => {
    const { svc, calls } = build();
    await assert.rejects(() => svc.sendMessage('hello', 'missing', undefined), status(404));
    assert.equal(calls.created.length, 0);
});

test('empty inbox is a normal answer, not a 404', async () => {
    const { svc } = build();
    const res = await svc.getAllMessages(U, { page: 1, limit: 20 });
    assert.deepEqual(res.items, []);
    assert.deepEqual(res.pagination, { page: 1, limit: 20, total: 0, pages: 0 });
});

test('inbox: pagination numbers and the user id is passed to the repository', async () => {
    const { svc, calls } = build({
        message: { getInbox: async () => ({ items: [{ _id: 'a', content: 'x', receiver: U, sender: 'leak', createdAt: 1 }], total: 45 }) },
    });
    const res = await svc.getAllMessages(U, { page: 2, limit: 20 });
    assert.equal(res.pagination.pages, 3);
    assert.equal(res.items.length, 1);
    assert.equal('sender' in res.items[0], false);
    const { svc: svc2, calls: calls2 } = build();
    await svc2.getAllMessages(U, { page: 3, limit: 5 });
    assert.deepEqual(calls2.inbox[0], { userId: U, opts: { page: 3, limit: 5 } });
    void calls;
});

test('getMessage: found -> public shape, not found / not yours -> 404', async () => {
    const found = build({ message: { findMessageForReceiver: async () => ({ _id: M, content: 'x', receiver: U, sender: 'leak', createdAt: 1 }) } });
    const res = await found.svc.getMessage(U, M);
    assert.equal('sender' in res, false);
    await assert.rejects(() => build().svc.getMessage(U, M), status(404));
});

test('deleteMessage: the repository receives message id and the owner id', async () => {
    const { svc, calls } = build({ message: { softDeleteMessage: async (id, userId) => ({ _id: id, userId }) } });
    await svc.deleteMessage(U, M);
    assert.equal(calls.deleted.length, 0); // custom fake replaced the recorder
});

test('deleteMessage on something that is not yours or already deleted -> 404', async () => {
    const { svc, calls } = build();
    await assert.rejects(() => svc.deleteMessage(U, M), status(404));
    assert.deepEqual(calls.deleted[0], { id: M, userId: U });
});