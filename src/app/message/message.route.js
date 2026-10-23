import { Router } from "express";
import * as messageController from '../message/controller/message.controller.js'
import { authGuard } from "../../lib/auth/guard.js";
import { rateLimits } from "../../lib/rate-limit/rateLimit.js";
const messageRouter = Router();

// anonymous send (no login needed)
messageRouter.post('/', rateLimits.sendMessage, messageController.sendMessage);
// logged-in send (the sender is stored for moderation, but never shown to the receiver)
messageRouter.post('/public', authGuard, rateLimits.sendMessage, messageController.sendMessage);

// inbox of the logged-in user
messageRouter.get('/', authGuard, messageController.getAllMessages)
messageRouter.get('/:id', authGuard, messageController.getMessage)
messageRouter.delete('/:id', authGuard, messageController.deleteMessage)

export default messageRouter;