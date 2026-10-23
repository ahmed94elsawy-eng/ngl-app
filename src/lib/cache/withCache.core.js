import { logger } from "../../pkg/logger/logger.js";

// factory: takes any provider with get/set so it can be tested without Redis
export function createWithCache(cacheProvider){
    return function withCache(ttl = 3600){
        return async (req, res, next) => {
            // only GET responses are safe to cache
            if (req.method !== 'GET') return next();

            const key = `${req.method}:${req.originalUrl}`;

            // fail-open: any cache problem (Redis down, corrupted value) just skips the cache
            let cachedBody;
            try {
                const cached = await cacheProvider.get(key);
                if (cached) cachedBody = JSON.parse(cached);
            } catch (err) {
                logger.error('cache read failed', { key, error: err.message });
            }

            if (cachedBody !== undefined) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cachedBody);
            }

            const originalJson = res.json.bind(res);
            res.json = (body) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    res.setHeader('X-Cache', 'MISS');
                    // fire-and-forget: never delay or break the response because of the cache
                    Promise.resolve()
                        .then(() => cacheProvider.set(key, JSON.stringify(body), ttl))
                        .catch((err) => logger.error('cache write failed', { key, error: err.message }));
                }
                // every status goes through (the old version dropped non-2xx and hung the request)
                return originalJson(body);
            };
            next();
        };
    };
}