import crypto from 'node:crypto';
import { AppError } from "../error/error.js";
import { logger } from "../../pkg/logger/logger.js";

// the client generates it (a UUID is ideal)
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

// factory: `cache` needs get / set(key, value, ttl) / del / setIfAbsent(key, value, ttl)
export function createIdempotency(cache){
    const logFail = (what, key) => (err) => logger.error(what, { key, error: err.message });

    return function idempotency({ ttl = 3600, lockTtl = 60, required = false } = {}){
        return async function (req, res, next){
            const header = req.headers['idempotency-key'];

            if (header === undefined) {
                if (required) return next(new AppError('Idempotency-Key header is required', 400));
                return next(); // no key = no idempotency
            }
            if (typeof header !== 'string' || !KEY_PATTERN.test(header)) {
                return next(new AppError('invalid Idempotency-Key header', 400));
            }

            // the key belongs to one user (or one IP for anonymous routes): nobody else can read or hit it
            const scope = req.user?.id ?? `ip:${req.ip}`;
            const path = String(req.originalUrl).split('?')[0];
            const key = `idem:${scope}:${req.method}:${path}:${header}`;

            // same key must mean the same request
            const fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');

            // 1. try to take the lock
            let acquired;
            try {
                acquired = await cache.setIfAbsent(key, JSON.stringify({ state: 'processing', fingerprint }), lockTtl);
            } catch (err) {
                logFail('idempotency lock failed', key)(err);
                return next(); // fail-open
            }

            // 2. somebody already used this key
            if (!acquired) {
                let record = null;
                try { record = JSON.parse(await cache.get(key)); } catch { /* treated as expired below */ }

                if (!record) return next(new AppError('please retry the request', 409)); // expired in between
                if (record.fingerprint !== fingerprint) {
                    return next(new AppError('Idempotency-Key was already used with a different request', 422));
                }
                if (record.state === 'processing') {
                    return next(new AppError('a request with this Idempotency-Key is still being processed', 409));
                }
                res.setHeader('Idempotency-Replayed', 'true');
                return res.status(record.status).json(record.body);
            }

            // 3. we own the lock: run the request, then store the result or release the lock
            let settled = false;
            const originalJson = res.json.bind(res);

            res.json = (body) => {
                if (settled) return originalJson(body);
                settled = true;
                const ok = res.statusCode >= 200 && res.statusCode < 300;
                // success: keep the answer for replays. failure: free the key so the client can retry
                Promise.resolve()
                    .then(() => ok
                        ? cache.set(key, JSON.stringify({ state: 'done', fingerprint, status: res.statusCode, body }), ttl)
                        : cache.del(key))
                    .catch(logFail('idempotency save failed', key))
                    .finally(() => originalJson(body));
                return res;
            };

            // client disconnected before we answered: free the lock
            res.once('close', () => {
                if (settled) return;
                settled = true;
                Promise.resolve().then(() => cache.del(key)).catch(logFail('idempotency release failed', key));
            });

            next();
        };
    };
}