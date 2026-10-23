import { AppError } from "../error/error.js";
import { logger } from "../../pkg/logger/logger.js";

// factory: `cache` needs incr / ttl / expire / decr (so it can be tested without Redis)
export function createRateLimiter(cache){

    // INCR then EXPIRE are two commands: if the process dies in between the key would live forever,
    // so whenever a counter has no TTL we set it again
    async function hit(key, windowSeconds){
        const count = await cache.incr(key);
        let secondsLeft = count === 1 ? -1 : await cache.ttl(key);
        if (secondsLeft < 0) {
            await cache.expire(key, windowSeconds);
            secondsLeft = windowSeconds;
        }
        return { count, secondsLeft };
    }

    // rules: [{ scope, limit, windowSeconds, key: (req) => string | null }]
    // a request is blocked if ANY rule is over its limit; a rule whose key is null is skipped
    return function rateLimit({ name, rules, skipSuccessful = false }){
        return async function (req, res, next){
            const counted = [];     // keys we incremented (for skipSuccessful)
            let blockedFor = 0;
            let minRemaining = Infinity;

            try {
                for (const rule of rules) {
                    const part = rule.key(req);
                    if (!part) continue;
                    const key = `rl:${name}:${rule.scope}:${part}`;
                    const { count, secondsLeft } = await hit(key, rule.windowSeconds);
                    counted.push(key);
                    minRemaining = Math.min(minRemaining, Math.max(rule.limit - count, 0));
                    if (count > rule.limit) blockedFor = Math.max(blockedFor, secondsLeft);
                }
            } catch (err) {
                // fail-open: Redis problems must not take the whole API down
                logger.error('rate limit check failed', { name, error: err.message });
                return next();
            }

            if (minRemaining !== Infinity) res.setHeader('RateLimit-Remaining', String(minRemaining));

            if (blockedFor > 0) {
                res.setHeader('Retry-After', String(blockedFor));
                return next(new AppError(`too many requests, try again in ${blockedFor} seconds`, 429));
            }

            if (skipSuccessful) {
                // successful requests (login ok) are given back, so only failures count
                res.once('finish', () => {
                    if (res.statusCode >= 400) return;
                    for (const key of counted) {
                        Promise.resolve()
                            .then(() => cache.decr(key))
                            .catch((err) => logger.error('rate limit decr failed', { key, error: err.message }));
                    }
                });
            }
            next();
        };
    };
}