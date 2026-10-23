import { AppError } from '../../../lib/error/error.js';

export const lockedError = (seconds) =>
    new AppError(`too many failed login attempts, try again in ${seconds} seconds`, 429);

// factory: `cache` needs get / set(key, value, ttl) / del / incr / expire / ttl
export function createLoginLock({
    cache, logger,
    maxFailures = 5,
    banSeconds = 300,            // 5 minutes
    failureWindowSeconds = 900,  // "consecutive" failures older than this are forgotten
}) {
    const norm = (email) => String(email).trim().toLowerCase();
    const failKey = (email) => `login:fail:${norm(email)}`;
    const banKey = (email) => `login:ban:${norm(email)}`;

    // throws 429 while the account is banned (even for the right password)
    async function assertNotLocked(email) {
        let left;
        try {
            left = await cache.ttl(banKey(email));
        } catch (err) {
            logger.error('login lock check failed', { error: err.message }); // fail-open
            return;
        }
        if (left > 0) throw lockedError(left);
    }

    // returns the ban length in seconds if this failure triggered a ban, otherwise 0
    async function recordFailure(email) {
        try {
            const key = failKey(email);
            const count = await cache.incr(key);
            const left = count === 1 ? -1 : await cache.ttl(key);
            if (left < 0) await cache.expire(key, failureWindowSeconds);
            if (count >= maxFailures) {
                await cache.set(banKey(email), '1', banSeconds);
                await cache.del(key);
                return banSeconds;
            }
        } catch (err) {
            logger.error('login failure record failed', { error: err.message });
        }
        return 0;
    }

    // a successful password check resets the consecutive counter
    async function recordSuccess(email) {
        try {
            await cache.del(failKey(email));
        } catch (err) {
            logger.error('login success record failed', { error: err.message });
        }
    }

    return { assertNotLocked, recordFailure, recordSuccess };
}