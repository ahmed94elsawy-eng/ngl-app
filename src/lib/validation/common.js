import { z } from 'zod';

// 24 hex chars exactly
export const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, { message: 'invalid id' });

export const pagination = {
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
};