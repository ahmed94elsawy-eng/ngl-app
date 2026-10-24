# NGL App — Backend API

A Node.js REST API for anonymous messaging, identity requests, and private conversations. This portfolio project focuses on authentication, access control, data modeling, validation, and integrations with external services.

<p align="left">
  <a href="https://github.com/ahmed94elsawy-eng/ngl-app">Source Code</a> ·
  <a href="https://documenter.getpostman.com/view/57077300/2sBYHUTfnf">Public API Documentation</a> ·
  <a href="https://lumpish-pushover-available.ngrok-free.dev/health">Demo Health Check</a>
</p>

> **Demo availability:** The API uses a temporary ngrok tunnel. The URL may become unavailable or change when the tunnel stops. Verify the health check before sharing the demo.

## Project Highlights

- User registration, email verification, login, and logout
- JWT authentication using secure cookies
- OTP-based password reset and optional two-factor authentication
- Google sign-in integration
- Anonymous and authenticated messaging
- Inbox retrieval, message lookup, and soft deletion
- Identity requests with accept/reject workflows
- Conversation creation and conversation messaging
- Profile picture, cover image, and CV upload endpoints
- Zod request validation and centralized error handling
- Request correlation IDs, security middleware, rate limiting, and idempotency support in selected flows
- Redis integration for application state and caching-related workflows
- HTTP request logging with Morgan

## Tech Stack

| Area | Technologies |
|---|---|
| Runtime | Node.js 24, ES Modules |
| HTTP API | Express 5 |
| Database | MongoDB, Mongoose |
| Cache and state | Redis, ioredis |
| Authentication | JWT, bcrypt, cookie-parser, Google Auth Library |
| Validation | Zod |
| HTTP security | Helmet, CORS, rate limiting |
| Uploads | Multer, file-type |
| Email | Mailjet |
| Logging | Morgan and the project logger |
| Tests | Node.js built-in test runner |
| Process management | PM2 |

## Core Workflow

1. A user sends a message to a recipient.
2. The recipient creates an identity request for that message.
3. The message sender accepts or rejects the request.
4. When accepted, the API creates or reuses the relevant conversation according to the application logic.
5. Conversation participants can exchange messages subject to authorization checks.

## Architecture

```text
ngl-app/
├── docs/                     # Requirements, contracts, database design
├── src/
│   ├── app/
│   │   ├── auth/             # Authentication and OTP workflows
│   │   ├── message/          # Message endpoints and business logic
│   │   ├── identity-request/ # Identity request lifecycle
│   │   ├── conversation/     # Conversations and their messages
│   │   └── user/             # User operations and uploads
│   ├── lib/                  # Configuration, database, auth, validation,
│   │                         # security, cache, email, and middleware
│   ├── pkg/                  # Redis, Mailjet, logging, shared utilities
│   ├── app.js                # Express app and middleware setup
│   ├── route.js              # API route composition
│   └── server.js             # Server entry point
└── tests/                    # Tests grouped by implementation phase
```

## API Overview

| Area | Base path | Purpose |
|---|---|---|
| Health | `/health` | Basic health response |
| Authentication | `/api/auth` | Registration, verification, login, password reset, 2FA, Google sign-in |
| Messages | `/api/message` | Anonymous messages and inbox operations |
| Identity requests | `/api/identity-requests` | Create, list, accept, reject |
| Conversations | `/api/conversations` | Conversations and conversation messages |
| User uploads | `/api/user` | Profile picture, CV, cover images |

Authentication uses an `access_token` cookie. Use Postman to explore the requests and response examples in the published API documentation.

**[Open the NGL App Postman API Documentation](https://documenter.getpostman.com/view/57077300/2sBYHUTfnf)**

## Run Locally

### Prerequisites

- Node.js 24
- npm
- MongoDB
- Redis
- Mailjet credentials for email-dependent flows
- Google OAuth Web Client ID for Google sign-in

### 1. Clone and install

```bash
git clone https://github.com/ahmed94elsawy-eng/ngl-app.git
cd ngl-app
npm ci
```

### 2. Configure environment variables

Create `.env.development` in the project root and provide credentials for development/test services. Never commit real environment files or secrets.

```dotenv
NODE_ENV=development
PORT=3000
ORIGINS=http://localhost:4200
TRUST_PROXY_HOPS=0
MONGODB_URL=
JWT_SECRET=
JWT_EXPIRES_IN_SECONDS=3600
COOKIE_SAMESITE=lax
GOOGLE_WEB_OAUTH_CLIENT_ID=
REDIS_URI=
REDIS_URL=
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_KEY_PREFIX=ngl-dev:
MAILJET_API_KEY=
MAILJET_API_SECRET=
MAILJET_FROM_EMAIL=
MAILJET_FROM_NAME=NGL App
```

These are placeholders, not working credentials. Configure the variables required by your environment and service providers.

### 3. Start development

```bash
npm run dev
```

The default API port is `3000`.

Test the health endpoint:

```bash
curl -i http://localhost:3000/health
```

### 4. Run tests and audit production dependencies

```bash
npm test
npm audit --omit=dev
```

Run these commands in your own environment and review their actual output before reporting test results or security status.

## Deployment Notes

- Configure `.env.production` directly on the server. Never commit it to Git.
- The production start script uses PM2 and Node's `--env-file=.env.production` option.
- Keep development and production databases separate.
- Configure CORS and trusted proxy settings for the actual deployment.
- Protect CVs and other private uploads from public access.
- Use HTTPS for public access.
- Never include passwords, tokens, OTPs, or connection strings in public documentation or logs.

The demo currently uses a temporary ngrok tunnel and should not be treated as a permanent production URL.

## Project Documentation

- [Requirements](docs/requirements.md)
- [API Contracts](docs/contracts.md)
- [Database Design](docs/db-design.md)
- [Public Postman API Documentation](https://documenter.getpostman.com/view/57077300/2sBYHUTfnf)

## About

I'm focused on backend engineering and building practical API systems involving authentication, data modeling, messaging workflows, validation, and third-party service integrations.

- GitHub: [ahmed94elsawy-eng](https://github.com/ahmed94elsawy-eng)

