import { Router } from "express";
import * as controller from './controller/identity-request.controller.js'
import { authGuard } from "../../lib/auth/guard.js";
import { rateLimits } from "../../lib/rate-limit/rateLimit.js";

const identityRequestRouter = Router();

identityRequestRouter.use(authGuard);

// receiver asks who sent a message
identityRequestRouter.post('/', rateLimits.identityRequest, controller.createRequest);
// sender: requests he received
identityRequestRouter.get('/received', controller.listReceived);
// receiver: requests he made (the sender appears only after acceptance)
identityRequestRouter.get('/sent', controller.listSent);
// sender decides
identityRequestRouter.patch('/:id/accept', controller.accept);
identityRequestRouter.patch('/:id/reject', controller.reject);

export default identityRequestRouter;