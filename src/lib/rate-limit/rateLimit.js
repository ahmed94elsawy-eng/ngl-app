import { cacheProvider } from "../cache/init.js";
import { createRateLimiter } from "./rateLimit.core.js";

const rateLimit = createRateLimiter(cacheProvider);

const MIN = 60;

const ip = (req) => req.ip ?? 'unknown';
// only meaningful after authGuard (null = rule skipped)
const userId = (req) => (req.user?.id ? String(req.user.id) : null);

// body fields are untrusted: only strings, normalized and capped (null = rule skipped)
const field = (req, name) => {
    const v = req.body?.[name];
    return typeof v === 'string' && v.length > 0 ? v.trim().toLowerCase().slice(0, 254) : null;
};
const ipAnd = (name) => (req) => {
    const v = field(req, name);
    return v ? `${ip(req)}:${v}` : null;
};

export const rateLimits = {
    // only failed logins count. Per-account protection is the 5-failures / 5-minutes ban (loginLock)
    login: rateLimit({
        name: 'login',
        skipSuccessful: true,
        rules: [
            { scope: 'ip', limit: 20, windowSeconds: 15 * MIN, key: ip },
        ],
    }),
    loginConfirm: rateLimit({
        name: 'login-confirm',
        skipSuccessful: true,
        rules: [{ scope: 'ip', limit: 20, windowSeconds: 15 * MIN, key: ip }],
    }),
    twoFactor: rateLimit({
        name: 'two-factor',
        rules: [{ scope: 'user', limit: 10, windowSeconds: 15 * MIN, key: userId }],
    }),
    register: rateLimit({
        name: 'register',
        rules: [{ scope: 'ip', limit: 10, windowSeconds: 60 * MIN, key: ip }],
    }),
    sendOtp: rateLimit({
        name: 'send-otp',
        rules: [{ scope: 'ip', limit: 10, windowSeconds: 60 * MIN, key: ip }],
    }),
    verifyAccount: rateLimit({
        name: 'verify-account',
        rules: [{ scope: 'ip', limit: 20, windowSeconds: 15 * MIN, key: ip }],
    }),
    resetPassword: rateLimit({
        name: 'reset-password',
        rules: [{ scope: 'ip', limit: 10, windowSeconds: 15 * MIN, key: ip }],
    }),
    google: rateLimit({
        name: 'google',
        rules: [{ scope: 'ip', limit: 30, windowSeconds: 15 * MIN, key: ip }],
    }),
    sendMessage: rateLimit({
        name: 'send-message',
        rules: [
            { scope: 'ip', limit: 20, windowSeconds: 10 * MIN, key: ip },
            { scope: 'ip-receiver', limit: 5, windowSeconds: 10 * MIN, key: ipAnd('receiver') },
        ],
    }),
    identityRequest: rateLimit({
        name: 'identity-request',
        rules: [{ scope: 'user', limit: 20, windowSeconds: 60 * MIN, key: userId }],
    }),
    conversationMessage: rateLimit({
        name: 'conversation-message',
        rules: [{ scope: 'user', limit: 60, windowSeconds: 10 * MIN, key: userId }],
    }),
};