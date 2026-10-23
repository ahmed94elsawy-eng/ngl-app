import { z } from 'zod';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Select the environment file explicitly. Keep the historical typo as a
// development-only fallback so the existing local setup continues to work.
const requestedNodeEnv = process.env.NODE_ENV ?? 'development';
const envFileCandidates = requestedNodeEnv === 'development'
    ? ['.env.development', '.env.devloment', '.env']
    : [`.env.${requestedNodeEnv}`, '.env'];

const envFile = envFileCandidates
    .map((file) => resolve(process.cwd(), file))
    .find((file) => existsSync(file));

if (envFile) config({ path: envFile });

const schema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000'),

    // ORIGINS supports comma-separated frontend origins. CORS_ORIGIN remains
    // supported for backward compatibility with older local env files.
    ORIGINS: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),

    // Number of trusted reverse proxies in front of the app (0 = none).
    TRUST_PROXY_HOPS: z.string().default('0'),

    MONGODB_URL: z.string(),
    JWT_SECRET: z.string(),
    JWT_EXPIRES_IN_SECONDS: z.string().default('3600'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    GOOGLE_WEB_OAUTH_CLIENT_ID: z.string(),

    // Prefer REDIS_URI/REDIS_URL for managed/online Redis, including rediss:// TLS URLs.
    // REDIS_HOST/PORT/PASSWORD remain supported for local or host-based Redis.
    REDIS_URI: z.string().optional(),
    REDIS_URL: z.string().optional(),
    REDIS_PORT: z.string().default('6379'),
    REDIS_HOST: z.string().optional(),
    REDIS_PASSWORD: z.string().optional().default(''),
    // Use a unique prefix if multiple apps share one Redis deployment.
    REDIS_KEY_PREFIX: z.string().default(''),

    MAILJET_API_KEY: z.string(),
    MAILJET_API_SECRET: z.string(),
    MAILJET_FROM_EMAIL: z.string(),
    MAILJET_FROM_NAME: z.string()
});

const parsed = schema.parse(process.env);

const originsRaw = parsed.ORIGINS ?? parsed.CORS_ORIGIN ??
    (parsed.NODE_ENV === 'development' ? 'http://localhost:4200' : '');
const origins = originsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// A backend-only deployment may intentionally have no browser frontend yet.
// An empty origins list sends no CORS allow-origin header; it does not block curl/Postman requests.

const redisUri = parsed.REDIS_URI?.trim() || parsed.REDIS_URL?.trim() || undefined;
if (!redisUri && !parsed.REDIS_HOST?.trim()) {
    throw new Error('Configure REDIS_URI/REDIS_URL for managed Redis, or REDIS_HOST for host-based Redis.');
}

export const env = {
    nodeEnv: parsed.NODE_ENV,
    port: Number(parsed.PORT),
    origins,
    // Preserve the old config property for any callers that still use it.
    corsOrigin: parsed.CORS_ORIGIN ?? originsRaw,
    trustProxyHops: Number(parsed.TRUST_PROXY_HOPS) || 0,
    db: {
        url: parsed.MONGODB_URL
    },
    google: {
        webClientId: parsed.GOOGLE_WEB_OAUTH_CLIENT_ID,
        iosClientId: parsed.GOOGLE_WEB_OAUTH_CLIENT_ID,
    },
    redis: {
        uri: redisUri,
        host: parsed.REDIS_HOST,
        port: Number(parsed.REDIS_PORT),
        password: parsed.REDIS_PASSWORD,
        keyPrefix: parsed.REDIS_KEY_PREFIX
    },
    mailjet: {
        apiKey: parsed.MAILJET_API_KEY,
        apiSecret: parsed.MAILJET_API_SECRET,
        fromEmail: parsed.MAILJET_FROM_EMAIL,
        fromName: parsed.MAILJET_FROM_NAME
    },
    jwt: {
        secret: parsed.JWT_SECRET,
        expiresInSeconds: Number(parsed.JWT_EXPIRES_IN_SECONDS)
    },
    cookie: {
        sameSite: parsed.COOKIE_SAMESITE,
        // Browsers require Secure cookies when SameSite=None is used.
        secure: parsed.NODE_ENV === 'production' || parsed.COOKIE_SAMESITE === 'none'
    },
    payments: {},
    aws: {}
};
