import { logger } from "../../pkg/logger/logger.js";

// factory so it can be tested without Redis
export function createRevocation(cacheProvider, now = () => Date.now()){
    const keyOf = (jti) => `revoked:${jti}`;

    // block a token until it would have expired anyway
    async function revoke({ jti, exp }){
        if (!jti || !exp) return false;
        const ttl = exp - Math.floor(now() / 1000);
        if (ttl <= 0) return false; // already expired, nothing to block
        await cacheProvider.set(keyOf(jti), '1', ttl);
        return true;
    }

    // fail-open: if Redis is down we skip this check (user/changeCredentialsTime checks still run)
    async function isRevoked(jti){
        if (!jti) return false;
        try {
            return Boolean(await cacheProvider.get(keyOf(jti)));
        } catch (err) {
            logger.error('revocation check failed', { error: err.message });
            return false;
        }
    }

    return { revoke, isRevoked };
}