import { z } from 'zod'
import { objectId, pagination } from '../../../lib/validation/common.js'

export const createRequestDto = z.object({ messageId: objectId })
export const requestIdDto = z.object({ id: objectId })
export const listReceivedDto = z.object({
    status: z.enum(['pending', 'accepted', 'rejected']).optional(),
    ...pagination
})
export const listDto = z.object({ ...pagination })