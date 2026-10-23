import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService, toConversationView } from '../../src/app/conversation/service/conversation.core.js';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const CONV = 'c1'.repeat(12);

function build(over = {}) {
    const messages = [];
    const calls = { touch: 0 };
    const repo = {
        // only A and B belong to the conversation
        async findForParticipant(id, userId) {
            return id === CONV && [A, B].includes(userId) ? { _id: CONV, message: 'm1', participants: [A, B] } : null;
        },
        async createMessage(conversation, author, content) {
            const doc = { _id: `msg${messages.length + 1}`, conversation, author, content, createdAt: new Date(0) };
            messages.push(doc);
            return doc;
        },
        async touch() { calls.touch++; },
        async listMessages() { return { items: [...messages].reverse(), total: messages.length }; },
        async listForUser() { return { items: [], total: 0 }; },
        ...over,
    };
    const logger = { error() {} };
    return { svc: createConversationService({ conversationRepository: repo, logger }), messages, calls };
}

const status = (code) => (err) => err.statusCode === code;

test('both participants can send and read messages', async () => {
    const { svc } = build();
    const m1 = await svc.sendMessage(A, CONV, 'hi from A');
    const m2 = await svc.sendMessage(B, CONV, 'hi from B');
    assert.equal(m1.author, A);
    assert.equal(m2.author, B);
    for (const user of [A, B]) {
        const { items, pagination } = await svc.getMessages(user, CONV, { page: 1, limit: 20 });
        assert.equal(items.length, 2);
        assert.equal(pagination.total, 2);
    }
});

test('a stranger cannot read or send: 404, and nothing is saved', async () => {
    const { svc, messages } = build();
    await assert.rejects(() => svc.getMessages(C, CONV), status(404));
    await assert.rejects(() => svc.sendMessage(C, CONV, 'hello'), status(404));
    assert.equal(messages.length, 0);
});

test('a missing conversation looks the same as a forbidden one', async () => {
    const { svc } = build();
    await assert.rejects(() => svc.getMessages(A, 'f'.repeat(24)), status(404));
});

test('the author always comes from the session, never from the request content', async () => {
    const { svc, messages } = build();
    await svc.sendMessage(A, CONV, 'x');
    assert.equal(messages[0].author, A);
});

test('a failure while updating the sort order does not fail a saved message', async () => {
    const { svc, messages } = build({ touch: async () => { throw new Error('db hiccup'); } });
    const res = await svc.sendMessage(A, CONV, 'x');
    assert.equal(res.content, 'x');
    assert.equal(messages.length, 1);
});

test('conversation view shows the other participant only', () => {
    const doc = { _id: CONV, message: 'm1', lastMessageAt: 1, participants: [{ _id: A, name: 'Alice' }, { _id: B, name: 'Bob' }] };
    assert.deepEqual(toConversationView(doc, A).with, { _id: B, name: 'Bob' });
    assert.deepEqual(toConversationView(doc, B).with, { _id: A, name: 'Alice' });
});