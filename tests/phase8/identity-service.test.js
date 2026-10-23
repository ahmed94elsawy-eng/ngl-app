import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityRequestService } from '../../src/app/identity-request/service/identity.core.js';

const SENDER = 's'.repeat(24);
const RECEIVER = 'r'.repeat(24);
const STRANGER = 'x'.repeat(24);
const MSG = 'm'.repeat(24);

function build({ message } = {}) {
    const requests = new Map();
    const conversations = new Map(); // message -> conversation
    let n = 0;
    const calls = { upserts: [] };

    const identityRepository = {
        async findByMessage(id) { return [...requests.values()].find((r) => r.message === id) ?? null; },
        async create(data) {
            if ([...requests.values()].some((r) => r.message === data.message)) throw Object.assign(new Error('dup'), { code: 11000 });
            const doc = { _id: `req${++n}`, status: 'pending', createdAt: new Date(0), ...data };
            requests.set(doc._id, doc);
            return { ...doc };
        },
        async findByIdForSender(id, senderId) {
            const r = requests.get(id);
            return r && r.sender === senderId ? { ...r } : null;
        },
        async transition(id, senderId, from, to) {
            const r = requests.get(id);
            if (!r || r.sender !== senderId || r.status !== from) return null;
            r.status = to; r.respondedAt = new Date(1);
            return { ...r };
        },
        async listReceived(senderId) {
            const items = [...requests.values()].filter((r) => r.sender === senderId)
                .map((r) => ({ ...r, message: { _id: r.message, content: 'hello' } }));
            return { items, total: items.length };
        },
        async listSent(receiverId) {
            const items = [...requests.values()].filter((r) => r.receiver === receiverId)
                .map((r) => ({ ...r, sender: { _id: r.sender, name: 'Sender Name' } })); // populated, like the real repo
            return { items, total: items.length };
        },
    };
    const messageRepository = {
        async findMessageWithSender(id) {
            if (id !== MSG) return null;
            return message === undefined ? { _id: MSG, receiver: RECEIVER, sender: SENDER } : message;
        },
    };
    const conversationRepository = {
        async upsertForMessage(messageId, participants) {
            calls.upserts.push({ messageId, participants });
            if (!conversations.has(messageId)) conversations.set(messageId, { _id: `conv${conversations.size + 1}`, message: messageId });
            return conversations.get(messageId);
        },
        async findByMessageIds(ids) { return ids.map((i) => conversations.get(i)).filter(Boolean); },
    };
    return { svc: createIdentityRequestService({ identityRepository, messageRepository, conversationRepository }), calls, requests };
}

const status = (code) => (err) => err.statusCode === code;

test('the receiver creates a pending request, and the view does not contain the sender', async () => {
    const { svc } = build();
    const view = await svc.requestIdentity(RECEIVER, MSG);
    assert.equal(view.status, 'pending');
    assert.equal(view.message, MSG);
    assert.equal('sender' in view, false);
});

test('only the receiver of the message can ask, a stranger or a missing message looks like not found', async () => {
    const { svc } = build();
    await assert.rejects(() => svc.requestIdentity(STRANGER, MSG), status(404));
    await assert.rejects(() => svc.requestIdentity(RECEIVER, 'z'.repeat(24)), status(404));
    // the sender himself is not the receiver either
    await assert.rejects(() => svc.requestIdentity(SENDER, MSG), status(404));
});

test('a message sent without login has no known sender -> 409', async () => {
    const { svc } = build({ message: { _id: MSG, receiver: RECEIVER } });
    await assert.rejects(() => svc.requestIdentity(RECEIVER, MSG), status(409));
});

test('a message you sent to yourself cannot be requested -> 400', async () => {
    const { svc } = build({ message: { _id: MSG, receiver: RECEIVER, sender: RECEIVER } });
    await assert.rejects(() => svc.requestIdentity(RECEIVER, MSG), status(400));
});

test('one request per message', async () => {
    const { svc } = build();
    await svc.requestIdentity(RECEIVER, MSG);
    await assert.rejects(() => svc.requestIdentity(RECEIVER, MSG), status(409));
});

test('the sender sees the request with the message content, and nothing about identity needs to be added', async () => {
    const { svc } = build();
    await svc.requestIdentity(RECEIVER, MSG);
    const { items, pagination } = await svc.listReceived(SENDER, { page: 1, limit: 20 });
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].message, { _id: MSG, content: 'hello' });
    assert.equal(items[0].status, 'pending');
    assert.equal(pagination.total, 1);
    assert.equal((await svc.listReceived(STRANGER)).items.length, 0);
});

test('accept: status becomes accepted and a conversation links the two users to the message', async () => {
    const { svc, calls } = build();
    const { _id } = await svc.requestIdentity(RECEIVER, MSG);
    const res = await svc.acceptRequest(SENDER, _id);
    assert.equal(res.request.status, 'accepted');
    assert.ok(res.conversationId);
    assert.deepEqual(calls.upserts[0], { messageId: MSG, participants: [SENDER, RECEIVER] });
});

test('accept twice returns the same conversation (safe to retry)', async () => {
    const { svc } = build();
    const { _id } = await svc.requestIdentity(RECEIVER, MSG);
    const a = await svc.acceptRequest(SENDER, _id);
    const b = await svc.acceptRequest(SENDER, _id);
    assert.equal(a.conversationId, b.conversationId);
});

test('only the sender can answer: the receiver (and strangers) get 404', async () => {
    const { svc, requests } = build();
    const { _id } = await svc.requestIdentity(RECEIVER, MSG);
    await assert.rejects(() => svc.acceptRequest(RECEIVER, _id), status(404));
    await assert.rejects(() => svc.rejectRequest(RECEIVER, _id), status(404));
    await assert.rejects(() => svc.acceptRequest(STRANGER, _id), status(404));
    assert.equal(requests.get(_id).status, 'pending');
});

test('reject: the status becomes rejected and no conversation is created', async () => {
    const { svc, calls } = build();
    const { _id } = await svc.requestIdentity(RECEIVER, MSG);
    const view = await svc.rejectRequest(SENDER, _id);
    assert.equal(view.status, 'rejected');
    assert.equal(calls.upserts.length, 0);
});

test('a decision is final: accept after reject and reject after accept are 409', async () => {
    const a = build();
    const r1 = await a.svc.requestIdentity(RECEIVER, MSG);
    await a.svc.rejectRequest(SENDER, r1._id);
    await assert.rejects(() => a.svc.acceptRequest(SENDER, r1._id), status(409));
    assert.equal((await a.svc.rejectRequest(SENDER, r1._id)).status, 'rejected'); // repeating the same answer is fine

    const b = build();
    const r2 = await b.svc.requestIdentity(RECEIVER, MSG);
    await b.svc.acceptRequest(SENDER, r2._id);
    await assert.rejects(() => b.svc.rejectRequest(SENDER, r2._id), status(409));
});

test('sent list: the identity is hidden while pending and after rejection, shown only after acceptance', async () => {
    const pending = build();
    await pending.svc.requestIdentity(RECEIVER, MSG);
    let item = (await pending.svc.listSent(RECEIVER)).items[0];
    assert.equal(item.status, 'pending');
    assert.equal('sender' in item, false);

    const rejected = build();
    const r = await rejected.svc.requestIdentity(RECEIVER, MSG);
    await rejected.svc.rejectRequest(SENDER, r._id);
    item = (await rejected.svc.listSent(RECEIVER)).items[0];
    assert.equal(item.status, 'rejected');
    assert.equal('sender' in item, false);
    assert.equal('conversation' in item, false);

    const accepted = build();
    const a = await accepted.svc.requestIdentity(RECEIVER, MSG);
    const { conversationId } = await accepted.svc.acceptRequest(SENDER, a._id);
    item = (await accepted.svc.listSent(RECEIVER)).items[0];
    assert.deepEqual(item.sender, { _id: SENDER, name: 'Sender Name' });
    assert.equal(item.conversation, conversationId);
});