import { validateBody } from "../../../lib/validation/validation.js"
import { conversationIdDto, listDto, sendMessageDto } from "../dto/conversation.dto.js"
import * as conversationService from '../service/conversation.service.js'

export async function listConversations(req, res, next) {
    try {
        const query = validateBody(listDto, req.query);
        const { items, pagination } = await conversationService.listConversations(req.user.id, query);
        res.json({ message: 'ok', success: true, data: items, pagination });
    } catch (error) { next(error) }
}

export async function getMessages(req, res, next) {
    try {
        const { id } = validateBody(conversationIdDto, req.params);
        const query = validateBody(listDto, req.query);
        const { items, pagination } = await conversationService.getMessages(req.user.id, id, query);
        res.json({ message: 'ok', success: true, data: items, pagination });
    } catch (error) { next(error) }
}

export async function sendMessage(req, res, next) {
    try {
        const { id } = validateBody(conversationIdDto, req.params);
        const { content } = validateBody(sendMessageDto, req.body);
        const data = await conversationService.sendMessage(req.user.id, id, content);
        res.status(201).json({ message: 'message sent', success: true, data });
    } catch (error) { next(error) }
}