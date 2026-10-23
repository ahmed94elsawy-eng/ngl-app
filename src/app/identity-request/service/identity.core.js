import { messageNotFound } from '../../message/errors.js';
import {
    requestNotFound, requestExists, senderUnknown, cannotRequestOwn, alreadyAccepted, alreadyRejected,
} from '../errors.js';

const paginationOf = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

// the request itself never contains the sender (only the "sent" list can add it, after acceptance)
export function toRequestView(doc) {
    return {
        _id: String(doc._id),
        message: String(doc.message?._id ?? doc.message),
        status: doc.status,
        createdAt: doc.createdAt,
        respondedAt: doc.respondedAt ?? null,
    };
}

// what the sender of the message sees
export function toReceivedView(doc) {
    return {
        _id: String(doc._id),
        message: doc.message?._id
            ? { _id: String(doc.message._id), content: doc.message.content }
            : { _id: String(doc.message), content: null },
        status: doc.status,
        createdAt: doc.createdAt,
        respondedAt: doc.respondedAt ?? null,
    };
}

// what the receiver sees: the identity appears ONLY when the request was accepted
export function toSentView(doc, conversationId) {
    const view = toRequestView(doc);
    if (doc.status === 'accepted') {
        if (doc.sender?._id) view.sender = { _id: String(doc.sender._id), name: doc.sender.name };
        if (conversationId) view.conversation = conversationId;
    }
    return view;
}

// factory so it can be tested without a database
export function createIdentityRequestService({ identityRepository, messageRepository, conversationRepository }) {

    // the receiver of a message asks who sent it
    async function requestIdentity(userId, messageId) {
        const message = await messageRepository.findMessageWithSender(messageId);
        // not yours / deleted / missing: same answer
        if (!message || String(message.receiver) !== String(userId)) throw messageNotFound;
        if (!message.sender) throw senderUnknown; // it was sent without login
        if (String(message.sender) === String(userId)) throw cannotRequestOwn;

        if (await identityRepository.findByMessage(messageId)) throw requestExists;

        let created;
        try {
            created = await identityRepository.create({ message: messageId, receiver: userId, sender: message.sender });
        } catch (err) {
            if (err?.code === 11000) throw requestExists; // two requests at the same time
            throw err;
        }
        return toRequestView(created);
    }

    // requests the user received as a sender
    async function listReceived(userId, { status, page = 1, limit = 20 } = {}) {
        const { items, total } = await identityRepository.listReceived(userId, { status, page, limit });
        return { items: items.map(toReceivedView), pagination: paginationOf(page, limit, total) };
    }

    // requests the user made as a receiver
    async function listSent(userId, { page = 1, limit = 20 } = {}) {
        const { items, total } = await identityRepository.listSent(userId, { page, limit });
        const acceptedMessages = items.filter((i) => i.status === 'accepted').map((i) => i.message);
        const conversations = acceptedMessages.length
            ? await conversationRepository.findByMessageIds(acceptedMessages)
            : [];
        const byMessage = new Map(conversations.map((c) => [String(c.message), String(c._id)]));
        return {
            items: items.map((i) => toSentView(i, byMessage.get(String(i.message)))),
            pagination: paginationOf(page, limit, total),
        };
    }

    // safe to repeat: a retry after a crash still creates the missing conversation
    async function acceptRequest(userId, requestId) {
        const current = await identityRepository.findByIdForSender(requestId, userId);
        if (!current) throw requestNotFound; // also when you are not the sender
        if (current.status === 'rejected') throw alreadyRejected;

        if (current.status === 'pending') {
            await identityRepository.transition(requestId, userId, 'pending', 'accepted');
        }
        // re-read: a parallel reject could have won
        const after = await identityRepository.findByIdForSender(requestId, userId);
        if (after.status !== 'accepted') throw alreadyRejected;

        const conversation = await conversationRepository.upsertForMessage(
            after.message, [after.sender, after.receiver]);
        return { request: toRequestView(after), conversationId: String(conversation._id) };
    }

    // a rejected request keeps the sender hidden for good
    async function rejectRequest(userId, requestId) {
        const current = await identityRepository.findByIdForSender(requestId, userId);
        if (!current) throw requestNotFound;
        if (current.status === 'accepted') throw alreadyAccepted;

        if (current.status === 'pending') {
            await identityRepository.transition(requestId, userId, 'pending', 'rejected');
        }
        const after = await identityRepository.findByIdForSender(requestId, userId);
        if (after.status !== 'rejected') throw alreadyAccepted; // a parallel accept won
        return toRequestView(after);
    }

    return { requestIdentity, listReceived, listSent, acceptRequest, rejectRequest };
}