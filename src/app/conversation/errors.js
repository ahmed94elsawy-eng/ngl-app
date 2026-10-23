import { AppError } from "../../lib/error/error.js";

// same answer for "doesn't exist" and "you are not part of it"
export const conversationNotFound = new AppError('Conversation Not Found.', 404);