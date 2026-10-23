import { userNotExist } from '../../user/errors.js';
import { messageNotFound } from '../errors.js';

// explicit whitelist: `sender` can never leave the API, even if a repository returns it
export function toPublicMessage(doc){
    return {
        _id: String(doc._id),
        content: doc.content,
        receiver: String(doc.receiver),
        createdAt: doc.createdAt,
    };
}

// factory so it can be tested without a database
export function createMessageService({ userRepository, messageRepository }){

    async function sendMessage(content, receiver, sender){
        // 1. check receiver exists
        const user = await userRepository.findUserById(receiver);
        if (!user) throw userNotExist;
        // 2. save message (sender is stored for moderation only, never returned)
        const created = await messageRepository.createMessage(content, receiver, sender);
        return toPublicMessage(created);
    }

    async function getAllMessages(userId, { page = 1, limit = 20 } = {}){
        const { items, total } = await messageRepository.getInbox(userId, { page, limit });
        return {
            items: items.map(toPublicMessage),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    async function getMessage(userId, id){
        const doc = await messageRepository.findMessageForReceiver(id, userId);
        if (!doc) throw messageNotFound;
        return toPublicMessage(doc);
    }

    async function deleteMessage(userId, id){
        const doc = await messageRepository.softDeleteMessage(id, userId);
        if (!doc) throw messageNotFound;
    }

    return { sendMessage, getAllMessages, getMessage, deleteMessage };
}