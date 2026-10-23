import { Router } from "express";
import * as authController from './controller/auth.controller.js';
import { idempotency } from "../../lib/idempotency/idempotency.js";
import { authGuard } from "../../lib/auth/guard.js";
import { rateLimits } from "../../lib/rate-limit/rateLimit.js";

const authRouter = Router();

authRouter.post('/register', rateLimits.register, authController.register);
authRouter.patch('/verify-account', rateLimits.verifyAccount, authController.verifiyAccount);
authRouter.post('/login', rateLimits.login, authController.login);
authRouter.post('/login/confirm', rateLimits.loginConfirm, authController.confirmLogin);
authRouter.post('/logout', authGuard, authController.logout);
authRouter.post('/send-otp', rateLimits.sendOtp, authController.sendOtp);
// required: false = the FE can keep working without the header. Set true once it sends Idempotency-Key.
authRouter.patch('/reset-password', rateLimits.resetPassword, idempotency({ required: false }), authController.resetPassword)
authRouter.post('/login-with-google', rateLimits.google, authController.loginWithGoogle)

// two-step verification (logged in)
authRouter.post('/2fa/enable', authGuard, rateLimits.twoFactor, authController.requestEnableTwoFactor);
authRouter.post('/2fa/enable/confirm', authGuard, rateLimits.twoFactor, authController.confirmEnableTwoFactor);

export default authRouter;