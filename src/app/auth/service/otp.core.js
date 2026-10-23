import crypto from 'node:crypto';
import { AppError } from '../../../lib/error/error.js';
import { otpExpired, invalidCode } from '../errors.js';

const PURPOSES = ['verify', 'reset', 'enable2fa', 'login2fa'];


const DEFAULTS = {
    ttlSeconds: 180,            // life of one code
    cooldownSeconds: 60,        // min gap between two codes
    maxRequests: 3,             // codes per window
    requestWindowSeconds: 900,  // 15 minutes
    maxAttempts: 5,             // wrong guesses per code
};

const tooManyAttempts = () =>
    new AppError('too many wrong attempts, please request a new code', 429);

// factory: `cache` needs get / set(key, value, ttl) / del / incr / expire / ttl
export function createOtpService({ cache, secret, generateCode, config = {} }) {
    const cfg = { ...DEFAULTS, ...config };

    function keysFor(email, purpose) {
        if (!PURPOSES.includes(purpose)) throw new Error(`invalid otp purpose: ${purpose}`);
        const e = String(email).trim().toLowerCase();
        const base = `otp:${purpose}:${e}`;
        return { e, code: base, attempts: `${base}:attempts`, requests: `${base}:requests` };
    }

    // the plain code is never stored
    const hashCode = (purpose, e, code) =>
        crypto.createHmac('sha256', secret).update(`${purpose}:${e}:${code}`).digest('hex');

    function safeEqual(a, b) {
        const ba = Buffer.from(a, 'utf8');
        const bb = Buffer.from(b, 'utf8');
        return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
    }

    // INCR then EXPIRE are two commands: if the process dies in between, the key would live forever,
    // so whenever a counter has no TTL we set it again
    async function incrWithWindow(key, windowSeconds) {
        const count = await cache.incr(key);
        let secondsLeft = count === 1 ? -1 : await cache.ttl(key);
        if (secondsLeft < 0) {
            await cache.expire(key, windowSeconds);
            secondsLeft = windowSeconds;
        }
        return { count, secondsLeft };
    }

    // returns the plain code so the caller can email it
    async function issue({ email, purpose }) {
        const k = keysFor(email, purpose);

        // 1. cooldown: a valid code was issued less than cooldownSeconds ago
        const remaining = await cache.ttl(k.code);
        if (remaining > 0) {
            const age = cfg.ttlSeconds - remaining;
            if (age < cfg.cooldownSeconds) {
                throw new AppError(
                    `please wait ${cfg.cooldownSeconds - age} seconds before requesting a new code`, 429);
            }
        }

        // 2. cap on how many codes can be requested per window
        const { count, secondsLeft } = await incrWithWindow(k.requests, cfg.requestWindowSeconds);
        if (count > cfg.maxRequests) {
            throw new AppError(
                `too many code requests, try again in ${Math.max(secondsLeft, 1)} seconds`, 429);
        }

        // 3. new code replaces the old one and resets the wrong-attempts counter
        const code = String(generateCode());
        await cache.set(k.code, hashCode(purpose, k.e, code), cfg.ttlSeconds);
        await cache.del(k.attempts);
        return code;
    }

    // throws on failure, returns true on success (single use)
    async function verify({ email, purpose, code }) {
        const k = keysFor(email, purpose);

        const stored = await cache.get(k.code);
        if (!stored) throw otpExpired; // also the answer for emails that never got a code

        // count BEFORE comparing, so parallel guesses can't skip the limit
        const { count } = await incrWithWindow(k.attempts, cfg.ttlSeconds);
        if (count > cfg.maxAttempts) {
            await cache.del(k.code);
            throw tooManyAttempts();
        }

        const ok = typeof code === 'string' && safeEqual(hashCode(purpose, k.e, code), stored);
        if (!ok) {
            if (count >= cfg.maxAttempts) {
                await cache.del(k.code);
                throw tooManyAttempts();
            }
            throw invalidCode;
        }

        await cache.del(k.code);
        await cache.del(k.attempts);
        return true;
    }

    return { issue, verify };
}