# Product Requirements

## 1. Purpose and scope

NGL App is a backend API for receiving anonymous or identified messages, managing user authentication, handling requests to reveal the sender of a message, and enabling private conversations after an identity request is accepted.

This document describes the requirements represented by the current backend implementation and identifies important production-readiness work. It is not a claim that deployment, hosting providers, or external credentials have already been configured.

## 2. Actors

- **Guest sender:** sends an anonymous message to a user without signing in.
- **Registered user / receiver:** verifies an account, signs in, manages an inbox, deletes messages from the inbox, uploads profile files, and can ask to reveal a known sender's identity.
- **Original message sender:** receives an identity request and can accept or reject it. If accepted, the sender and receiver can communicate in a private conversation.
- **Google-authenticated user:** signs in through a Google ID token verified by the backend.
- **Backend operator:** configures environment variables, external services, deployment, logs, backups, and operational security.

## 3. Functional requirements

### FR-01 — Account registration and verification

1. A user can register with name, email, and password; date of birth and gender are optional.
2. Email is normalized to lowercase and must be unique.
3. The password must meet the current DTO length rule of 8–16 characters and is hashed before storage.
4. A new local account starts unverified.
5. The backend generates and emails a six-digit verification code.
6. A valid verification code marks the account as verified.

### FR-02 — Login and session management

1. A verified local user can log in using email and password.
2. Successful login issues a signed JWT in an HttpOnly `access_token` cookie; the token is not returned in the JSON body.
3. The backend can reject missing, expired, invalid, revoked, or stale sessions.
4. A user can log out the current session or request logout from all devices.
5. Repeated failed login attempts are tracked and can temporarily lock login attempts for that email.

### FR-03 — Password reset and OTP handling

1. A user can request an email code using the email address.
2. For an existing unverified account, the code is for verification; for an existing verified account, it is for password reset.
3. Password reset requires email, valid code, and a new password that meets the current password length rule.
4. Successful password reset invalidates previously issued sessions.
5. The active OTP implementation stores a keyed hash in Redis, expires the code after 180 seconds, applies a 60-second resend cooldown, limits requests to 3 per 15-minute window, and limits wrong attempts to 5 per code.
6. The response to OTP requests must not plainly reveal whether an email is registered.

### FR-04 — Google login

1. The client supplies a Google ID token.
2. The backend verifies the token and requires Google's verified-email claim.
3. The backend can create a verified Google-provider user when no matching account exists.
4. A local-provider account must not be silently taken over by Google login.

### FR-05 — Optional two-step verification

1. An authenticated user can request a code to enable two-step verification.
2. The user must confirm the code before the feature becomes enabled.
3. When enabled, local login requires an emailed code after a correct password and before issuing the session cookie.

### FR-06 — Message creation and inbox

1. Anyone can send an anonymous message to an existing user.
2. An authenticated user can send a message through the public/identified route.
3. Message content must be 1–200 characters after trimming.
4. The receiver can list inbox messages using pagination, read one of their messages, and soft-delete a message.
5. Sender identity must not be included in ordinary public message responses.
6. A message sent anonymously must not offer sender identity reveal because no sender identity is known.

### FR-07 — Identity reveal requests

1. An authenticated receiver can request the identity of the known sender of a message in their own inbox.
2. At most one identity request can exist for a message.
3. The original sender can list received requests, optionally filtered by status, and accept or reject each request.
4. The requester must not see the sender's identity while the request is pending or rejected.
5. Accepting a request reveals the sender and creates or reuses a conversation for the two participants.

### FR-08 — Private conversations

1. A user can list their conversations.
2. A conversation contains the original sender and receiver as participants.
3. Only participants may read messages or send messages in that conversation.
4. Conversation-message content must be 1–1000 characters after trimming.
5. Sending a message updates the conversation's last-activity timestamp when possible.

### FR-09 — User uploads

1. An authenticated user can upload a profile picture as PNG/JPEG, one file, up to 5 MiB.
2. An authenticated user can upload a PDF CV, one file, up to 5 MiB.
3. An authenticated user can upload up to three PNG/JPEG cover images, each up to 5 MiB.
4. The backend must validate actual file content, not rely only on the extension or the MIME type claimed by the client.
5. The user document stores the resulting file paths.

### FR-10 — Validation and HTTP behavior

1. Request payloads are validated before business operations.
2. Invalid requests receive a structured error response.
3. Unknown routes return HTTP 404.
4. Responses include a correlation ID in the error body for troubleshooting.
5. Sensitive internals, password hashes, and private sender identity are excluded from public API responses.

## 4. Non-functional requirements

### Security

- Keep all production secrets outside version control and use distinct secrets for development and production.
- Use HTTPS in production; set secure cookie options consistently with the deployed frontend/domain.
- Use exact CORS origins. Do not use a wildcard origin with credentialed cookie requests.
- Keep authentication, ownership, and conversation-participant checks on the server.
- Limit abuse with rate limiting, OTP limits, and login locks.
- Never publish password hashes, OTP plaintext, private CVs, or unrevealed sender identities.

### Reliability and data integrity

- MongoDB and Redis connection settings must point to production services with valid credentials and network access.
- Unique indexes must be created and verified for email, one identity request per message, and one conversation per original message.
- The deployment must have documented backup and restore procedures for MongoDB.
- File storage must be durable across process restarts and instance replacements.

### Maintainability

- Keep route contracts, validation schemas, and models consistent.
- Update this folder whenever an endpoint, DTO, model, index, or business rule changes.
- Run the automated test suite with `npm test` before release.
- Use structured logs and correlation IDs without logging credentials, JWTs, OTPs, or private message contents unnecessarily.

### Performance and abuse resistance

- Paginated endpoints must enforce the current maximum limit of 50.
- Inbox and conversation queries should use the indexes documented in `db-design.md`.
- Configure reverse-proxy trust only for the actual production proxy topology, so IP-based limits are not derived from untrusted headers.

## 5. Environment and runtime requirements

The current configuration expects these production settings to be supplied securely:

- `NODE_ENV`, `PORT`
- `MONGODB_URL`
- `JWT_SECRET`, optional `JWT_EXPIRES_IN_SECONDS`
- `GOOGLE_WEB_OAUTH_CLIENT_ID`
- Redis configuration using `REDIS_URI` or `REDIS_URL`, or host configuration using `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`
- `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAILJET_FROM_EMAIL`, `MAILJET_FROM_NAME`
- `ORIGINS` for the exact frontend origin(s), if a browser frontend will be deployed
- Optional `COOKIE_SAMESITE`, `TRUST_PROXY_HOPS`, and `REDIS_KEY_PREFIX`

`npm start` runs the server using the environment-loading behavior in the app. `npm run start:prod` explicitly loads `.env.production` and requires a compatible Node.js version that supports `--env-file` (Node.js 20.6 or newer).

## 6. Current implementation boundaries

The following are not implemented as public API capabilities in the current route registry:

- General profile read/update endpoints (the user router currently exposes file-upload routes only).
- Facebook login, even though `facebook` is a permitted provider value in the schema.
- A WebSocket/realtime chat transport; conversation messaging is HTTP-based.
- Private, authorization-controlled CV download endpoints.
- A production health/readiness endpoint that actually checks MongoDB and Redis.

## 7. Production readiness checklist — resolve before real users

- [ ] **Protect CV uploads.** The current `/uploads` static route publicly serves files under the uploads directory, including CVs. Make CV storage private and implement authorized downloads before handling real CVs.
- [ ] **Use durable file storage.** Current uploads are saved to local disk; use S3 or another durable, access-controlled store for production/multi-instance deployments.
- [ ] **Improve health checks.** `/health` currently returns `"OK"` without testing database/cache dependencies; add a readiness endpoint that reports dependency state without leaking secrets.
- [ ] **Verify Redis failure behavior.** Some rate-limit/login-lock paths intentionally fail open on Redis errors. Decide whether that is acceptable for production and alert on dependency failures.
- [ ] **Configure HTTPS and proxy trust.** Terminate TLS with a trusted proxy such as Nginx or a managed load balancer. Set `TRUST_PROXY_HOPS` to match the actual trusted proxy count; do not guess.
- [ ] **Validate production environment variables.** Test startup with the real production config while keeping `.env.production` and credentials out of Git and out of screenshots/logs.
- [ ] **Test all main flows.** Registration, verification, login, 2FA, password reset, logout, anonymous messages, identity request accept/reject, conversation access control, and all upload validation cases.
- [ ] **Review CORS and cookies.** If there is no browser frontend yet, an empty `ORIGINS` list is reasonable for backend-only use; Postman/curl do not rely on browser CORS. Add exact frontend origins when a frontend is deployed.
- [ ] **Set up operations.** Configure MongoDB backups, log retention, monitoring/alerts, server updates, and a restart strategy for the Node process.

## 8. Acceptance criteria for the first deployment

A first backend-only deployment is acceptable for a controlled demo when:

1. The application starts successfully with production environment variables and connects to MongoDB and Redis.
2. `GET /health` responds over the intended HTTPS domain (noting that the current endpoint is only a basic HTTP check).
3. All automated tests pass.
4. Authentication cookies work through the actual production proxy/domain.
5. Protected endpoints reject requests without a valid session, and users cannot access another user's inbox or conversation.
6. Real secrets are absent from Git and logs.
7. The public CV exposure described above is fixed before users upload private documents.
