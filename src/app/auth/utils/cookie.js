import { env } from '../../../lib/config/env.js';

// pure builder (easy to test)
export function buildCookieOptions({ secure, sameSite, maxAgeSeconds }){
    return {
        httpOnly: true,
        secure,
        sameSite,
        ...(maxAgeSeconds ? { maxAge: maxAgeSeconds * 1000 } : {}),
    };
}

export const accessCookieOptions = () => buildCookieOptions({
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    maxAgeSeconds: env.jwt.expiresInSeconds,
});

// clearCookie must use the same options (without maxAge) or the browser keeps the cookie
export const clearCookieOptions = () => buildCookieOptions({
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
});