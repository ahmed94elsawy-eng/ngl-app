import { validateBody } from "../../../lib/validation/validation.js"
import { createRequestDto, requestIdDto, listReceivedDto, listDto } from "../dto/identity-request.dto.js"
import * as identityService from '../service/identity.service.js'

export async function createRequest(req, res, next) {
    try {
        const { messageId } = validateBody(createRequestDto, req.body);
        const data = await identityService.requestIdentity(req.user.id, messageId);
        res.status(201).json({ message: 'identity request created', success: true, data });
    } catch (error) { next(error) }
}

// requests I received as the sender of a message
export async function listReceived(req, res, next) {
    try {
        const query = validateBody(listReceivedDto, req.query);
        const { items, pagination } = await identityService.listReceived(req.user.id, query);
        res.json({ message: 'ok', success: true, data: items, pagination });
    } catch (error) { next(error) }
}

// requests I made as the receiver of a message
export async function listSent(req, res, next) {
    try {
        const query = validateBody(listDto, req.query);
        const { items, pagination } = await identityService.listSent(req.user.id, query);
        res.json({ message: 'ok', success: true, data: items, pagination });
    } catch (error) { next(error) }
}

export async function accept(req, res, next) {
    try {
        const { id } = validateBody(requestIdDto, req.params);
        const data = await identityService.acceptRequest(req.user.id, id);
        res.json({ message: 'request accepted, a conversation was created', success: true, data });
    } catch (error) { next(error) }
}

export async function reject(req, res, next) {
    try {
        const { id } = validateBody(requestIdDto, req.params);
        const data = await identityService.rejectRequest(req.user.id, id);
        res.json({ message: 'request rejected', success: true, data });
    } catch (error) { next(error) }
}