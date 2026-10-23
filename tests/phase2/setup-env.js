// dummy values so env.js validation passes without a real .env (real values are never overridden)
const defaults = {
    MONGODB_URL: 'mongodb://localhost/test',
    JWT_SECRET: 'test-secret',
    MAIL_USER: 'a@b.com',
    MAIL_PASS: 'x',
    GOOGLE_WEB_OAUTH_CLIENT_ID: 'x',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: 'x',
    MAILJET_API_KEY: 'x',
    MAILJET_API_SECRET: 'x',
    MAILJET_FROM_EMAIL: 'a@b.com',
    MAILJET_FROM_NAME: 'NGL',
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;