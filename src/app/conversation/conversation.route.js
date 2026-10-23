import { Router } from "express";
import * as controller from './controller/conversation.controller.js'
import { authGuard } from "../../lib/auth/guard.js";
import { rateLimits } from "../../lib/rate-limit/rateLimit.js";

const conversationRouter = Router();

conversationRouter.use(authGuard);

conversationRouter.get('/', controller.listConversations);
conversationRouter.get('/:id/messages', controller.getMessages);
conversationRouter.post('/:id/messages', rateLimits.conversationMessage, controller.sendMessage);

export default conversationRouter;