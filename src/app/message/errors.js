import { AppError } from "../../lib/error/error.js";

// same answer for "not yours", "deleted" and "doesn't exist"
export const messageNotFound = new AppError('Message Not Found.', 404);