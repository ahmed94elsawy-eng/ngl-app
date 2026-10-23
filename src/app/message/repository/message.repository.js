import {Message} from "../model/message.model.js";

const PUBLIC_FIELDS = 'content receiver createdAt';

export function createMessage(content, receiver, sender){
    return Message.create({
        content: content,
        sender: sender,
        receiver: receiver
    });
}

export async function getInbox(userId, { page, limit }) {
    const filter = { receiver: userId, isDeleted: false };
    const [items, total] = await Promise.all([
        Message.find(filter)
            .select(PUBLIC_FIELDS)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Message.countDocuments(filter),
    ]);
    return { items, total };
}

// only the receiver can read his message (a wrong owner looks exactly like "not found")
export function findMessageForReceiver(id, userId) {
    return Message.findOne({ _id: id, receiver: userId, isDeleted: false })
        .select(PUBLIC_FIELDS)
        .lean();
}

// soft delete, returns null if there was nothing to delete
export function softDeleteMessage(id, userId) {
    return Message.findOneAndUpdate(
        { _id: id, receiver: userId, isDeleted: false },
        { isDeleted: true },
        { new: true }
    ).select(PUBLIC_FIELDS).lean();
}

// internal use only (identity requests): the only query that reads `sender`
export function findMessageWithSender(id) {
    return Message.findOne({ _id: id, isDeleted: false }).select('+sender').lean();
}