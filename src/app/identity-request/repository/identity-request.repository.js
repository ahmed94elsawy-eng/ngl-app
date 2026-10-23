import { IdentityRequest } from "../model/identity-request.model.js";

export function create(data) {
    return IdentityRequest.create(data);
}

export function findByMessage(messageId) {
    return IdentityRequest.findOne({ message: messageId }).lean();
}

// only the sender of the message can read / answer the request
export function findByIdForSender(id, senderId) {
    return IdentityRequest.findOne({ _id: id, sender: senderId }).lean();
}

// atomic: succeeds only if the request is still in the `from` status, otherwise returns null
export function transition(id, senderId, from, to) {
    return IdentityRequest.findOneAndUpdate(
        { _id: id, sender: senderId, status: from },
        { status: to, respondedAt: new Date() },
        { new: true }
    ).lean();
}

export async function listReceived(senderId, { status, page, limit }) {
    const filter = { sender: senderId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
        IdentityRequest.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('message', 'content')
            .lean(),
        IdentityRequest.countDocuments(filter),
    ]);
    return { items, total };
}

export async function listSent(receiverId, { page, limit }) {
    const filter = { receiver: receiverId };
    const [items, total] = await Promise.all([
        IdentityRequest.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('sender', 'name') // the service only exposes it when the request was accepted
            .lean(),
        IdentityRequest.countDocuments(filter),
    ]);
    return { items, total };
}