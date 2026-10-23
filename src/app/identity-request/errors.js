import { AppError } from "../../lib/error/error.js";

export const requestNotFound = new AppError('Request Not Found.', 404);
export const requestExists = new AppError('Identity was already requested for this message.', 409);
export const senderUnknown = new AppError('The sender of this message is unknown.', 409);
export const cannotRequestOwn = new AppError('You cannot request the identity of your own message.', 400);
export const alreadyAccepted = new AppError('Request was already accepted.', 409);
export const alreadyRejected = new AppError('Request was already rejected.', 409);