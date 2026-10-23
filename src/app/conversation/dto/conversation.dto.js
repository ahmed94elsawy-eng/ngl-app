import { z } from 'zod'
import { objectId, pagination } from '../../../lib/validation/common.js'
import { CONVERSATION_CONTENT_MIN, CONVERSATION_CONTENT_MAX } from '../conversation.constants.js'

export const conversationIdDto = z.object({ id: objectId })
export const listDto = z.object({ ...pagination })
export const sendMessageDto = z.object({
    content: z.string().trim().min(CONVERSATION_CONTENT_MIN).max(CONVERSATION_CONTENT_MAX)
})