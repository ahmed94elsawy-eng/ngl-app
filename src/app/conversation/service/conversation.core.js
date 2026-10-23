import { conversationNotFound } from '../errors.js';

const paginationOf = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

export function toMessageView(doc) {
    return {
        _id: String(doc._id),
        conversation: String(doc.conversation),
        author: String(doc.author),
        content: doc.content,
        createdAt: doc.createdAt,
    };
}

// the other participant (participants are populated with { _id, name })
export function toConversationView(doc, userId) {
    const other = (doc.participants ?? []).find((p) => String(p._id ?? p) !== String(userId));
    return {
        _id: String(doc._id),
        message: String(doc.message),
        with: other?._id ? { _id: String(other._id), name: other.name } : null,
        lastMessageAt: doc.lastMessageAt,
    };
}

// factory so it can be tested without a database
export function createConversationService({ conversationRepository, logger }) {

    // every operation starts here: not a participant = not found
    async function requireParticipant(userId, conversationId) {
        const conversation = await conversationRepository.findForParticipant(conversationId, userId);
        if (!conversation) throw conversationNotFound;
        return conversation;
    }

    async function listConversations(userId, { page = 1, limit = 20 } = {}) {
        const { items, total } = await conversationRepository.listForUser(userId, { page, limit });
        return {
            items: items.map((c) => toConversationView(c, userId)),
            pagination: paginationOf(page, limit, total),
        };
    }

    async function sendMessage(userId, conversationId, content) {
        await requireParticipant(userId, conversationId);
        const created = await conversationRepository.createMessage(conversationId, userId, content);
        // only used for sorting the list: a failure here must not fail a message that was saved
        try {
            await conversationRepository.touch(conversationId);
        } catch (err) {
            logger?.error('conversation touch failed', { error: err.message });
        }
        return toMessageView(created);
    }

    // newest first
    async function getMessages(userId, conversationId, { page = 1, limit = 20 } = {}) {
        await requireParticipant(userId, conversationId);
        const { items, total } = await conversationRepository.listMessages(conversationId, { page, limit });
        return { items: items.map(toMessageView), pagination: paginationOf(page, limit, total) };
    }

    return { listConversations, sendMessage, getMessages };
}