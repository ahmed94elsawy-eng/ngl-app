import { Conversation } from "../model/conversation.model.js";
import { ConversationMessage } from "../model/conversation-message.model.js";

// one conversation per message: calling it twice returns the same conversation
export async function upsertForMessage(messageId, participants) {
    const run = () => Conversation.findOneAndUpdate(
        { message: messageId },
        { $setOnInsert: { participants, lastMessageAt: new Date() } },
        { upsert: true, new: true }
    ).lean();
    try {
        return await run();
    } catch (err) {
        // two accepts at the same moment: the other one created it first
        if (err?.code === 11000) return await Conversation.findOne({ message: messageId }).lean();
        throw err;
    }
}

export function findByMessageIds(messageIds) {
    return Conversation.find({ message: { $in: messageIds } }).select('_id message').lean();
}

// only a participant can open a conversation
export function findForParticipant(id, userId) {
    return Conversation.findOne({ _id: id, participants: userId }).lean();
}

export async function listForUser(userId, { page, limit }) {
    const filter = { participants: userId };
    const [items, total] = await Promise.all([
        Conversation.find(filter)
            .sort({ lastMessageAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('participants', 'name')
            .lean(),
        Conversation.countDocuments(filter),
    ]);
    return { items, total };
}

export function touch(id) {
    return Conversation.updateOne({ _id: id }, { lastMessageAt: new Date() });
}

export function createMessage(conversationId, authorId, content) {
    return ConversationMessage.create({ conversation: conversationId, author: authorId, content });
}

export async function listMessages(conversationId, { page, limit }) {
    const filter = { conversation: conversationId };
    const [items, total] = await Promise.all([
        ConversationMessage.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        ConversationMessage.countDocuments(filter),
    ]);
    return { items, total };
}