import {z} from 'zod'
import { CONTENT_MIN, CONTENT_MAX } from '../message.constants.js'

// 24 hex chars exactly (Types.ObjectId.isValid also accepts any 12 character string)
const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, { message: 'invalid id' });

export const sendMessageDto = z.object({
    content: z.string().trim().min(CONTENT_MIN).max(CONTENT_MAX),
    receiver: objectId
})

export const listMessagesDto = z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
})

export const messageIdDto = z.object({
    id: objectId
})