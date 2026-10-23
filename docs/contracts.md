# API Contracts

## 1. Overview

- **Application:** NGL App Backend
- **Base path:** `/api`
- **Local base URL:** `http://localhost:3000/api`
- **Health URL:** `GET /health` (outside the `/api` prefix)
- **Request format:** JSON unless an endpoint explicitly requires `multipart/form-data`.
- **ID format:** MongoDB ObjectId represented as a 24-character hexadecimal string.

The routes below describe the API currently registered in `src/route.js` and the feature routers. They do not imply that an unlisted endpoint exists.

## 2. Authentication and common behavior

Authentication uses the **`access_token` HttpOnly cookie**. Successful login endpoints set this cookie; they do not return the JWT in the response body. Protected endpoints require the cookie. Clients using `fetch` should send credentials, for example `credentials: 'include'`.

In production, the cookie is configured as Secure. `COOKIE_SAMESITE` and `ORIGINS` must be consistent with the deployed frontend and domain. A frontend on another origin must use credentialed requests and an exact origin allowed by CORS.

Successful responses generally use this shape:

```json
{
  "message": "operation description",
  "success": true,
  "data": {}
}
```

The exact fields differ by endpoint. List endpoints return `data` plus `pagination`:

```json
{
  "message": "ok",
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

Errors return:

```json
{
  "message": "error description",
  "success": false,
  "correlationId": "request-correlation-id"
}
```

Pagination query parameters are `page` and `limit`. Defaults are `page=1` and `limit=20`; `page` must be from 1 to 10000 and `limit` from 1 to 50. Inputs are validated with Zod. Rate-limited routes may return HTTP `429` and a `Retry-After` header.

## 3. Health

### `GET /health`

No authentication. Returns the JSON string:

```json
"OK"
```

**Important:** this endpoint currently confirms only that the HTTP application responds. It does not perform MongoDB or Redis health checks.

## 4. Authentication — `/api/auth`

### `POST /register`

Creates a local account and sends an email verification code.

Request body:

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "password": "StrongPass123",
  "dob": "2003-01-15",
  "gender": "male"
}
```

`dob` and `gender` are optional; `gender` is `male` or `female`. `name` must be 3–20 characters. `password` must be 8–16 characters. Success: HTTP `201`; response includes the created user in `data`. Password hashes must never be exposed.

### `PATCH /verify-account`

Verifies an account using the code sent by email.

```json
{ "email": "user@example.com", "code": "123456" }
```

`code` must be exactly six digits. Success: HTTP `200`; updated user is returned in `data`.

### `POST /login`

```json
{ "email": "user@example.com", "password": "StrongPass123" }
```

For a normal verified account, success sets `access_token` and returns a success message. When two-step verification is enabled, the response is `{ "message": "verification code sent to your email, confirm it to finish login", "success": true, "data": { "twoFactorRequired": true } }`; no access cookie is issued until the next step.

### `POST /login/confirm`

Completes a two-step login after the emailed code is supplied.

```json
{ "email": "user@example.com", "code": "123456" }
```

Success sets `access_token`.

### `POST /logout` — authenticated

Clears the current browser cookie and revokes the current token. Optional body:

```json
{ "all": true }
```

When `all` is `true`, tokens issued before the account's credential-change timestamp are invalidated across devices.

### `POST /send-otp`

```json
{ "email": "user@example.com" }
```

Sends a verification code for an unverified account or a password-reset code for a verified account. The public response is intentionally similar for unknown addresses to reduce account enumeration.

### `PATCH /reset-password`

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewStrongPass123"
}
```

`newPassword` must be 8–16 characters. Success invalidates existing sessions by updating the user's credential-change timestamp. `Idempotency-Key` is optional in the current implementation.

### `POST /login-with-google`

```json
{ "idToken": "GOOGLE_ID_TOKEN_FROM_CLIENT" }
```

The backend verifies Google's ID token and the verified-email claim. Success sets `access_token`. A local account cannot be taken over by attempting Google login with the same email. Facebook is present as a provider value in the schema, but there is no Facebook-login route in the current API.

### `POST /2fa/enable` — authenticated

Requests an email code to enable two-step verification. No request body is required.

### `POST /2fa/enable/confirm` — authenticated

```json
{ "code": "123456" }
```

Confirms the emailed code and enables two-step verification.

## 5. User file uploads — `/api/user`

All three endpoints require authentication and use `multipart/form-data`. Each file is limited to 5 MiB. The server checks the claimed MIME type and then validates the actual file content.

### `POST /upload-profile-pic`

- Form field: `pp`
- Allowed formats: PNG or JPEG
- Success response data: `{ "profilePicPath": "/uploads/profile/<generated-name>.<ext>" }`

### `POST /upload-cv`

- Form field: `cv`
- Allowed format: PDF only
- Success response data: `{ "cvPath": "/uploads/cv/<generated-name>.pdf" }`

### `POST /upload-cover-images`

- Form field: `cover-images` (multiple files)
- Maximum count: 3
- Allowed formats: PNG or JPEG
- Success response data: `{ "coverImagePaths": ["/uploads/covers/<generated-name>.<ext>"] }`

**Production security note:** the current application serves the whole `uploads` directory through the public `/uploads` static route. This includes CV files. Before accepting real users or sensitive CVs, change this behavior so private files are not publicly served and are delivered only through an authorized download flow or private object storage.

## 6. Messages — `/api/message`

Message content is trimmed and must contain 1–200 characters. `receiver` must be an existing user's ObjectId. The sender identity is never included in public message responses.

### `POST /` — anonymous message

```json
{ "receiver": "507f1f77bcf86cd799439011", "content": "Your message here" }
```

No login is required. Creates a message with no known sender. Success: HTTP `201`.

### `POST /public` — authenticated message

Uses the same request body as `POST /`. The authenticated sender is stored internally for moderation/identity-request workflows, but is excluded from the message response and ordinary message queries.

### `GET /` — authenticated inbox

Optional query: `?page=1&limit=20`. Returns the logged-in user's non-deleted inbox, newest first.

### `GET /:id` — authenticated

Returns a single message only when it belongs to the logged-in user's inbox.

### `DELETE /:id` — authenticated

Soft-deletes a message from the logged-in user's inbox. This does not physically delete the document.

## 7. Identity requests — `/api/identity-requests`

All routes require authentication. This feature lets the receiver of an anonymous/public message ask its original sender to reveal their identity. A message sent anonymously has no sender to reveal and cannot produce a request.

### `POST /`

The receiver creates a request for one message:

```json
{ "messageId": "507f1f77bcf86cd799439011" }
```

Success: HTTP `201`. A request can be created only for a message in the current user's inbox, with a known sender, and only once per message.

### `GET /received`

Optional query: `status=pending|accepted|rejected`, `page`, `limit`. Lists identity requests received by the original sender; each result includes the related message's ID and content so that the sender can decide.

### `GET /sent`

Optional query: `page`, `limit`. Lists requests the current user made as a message receiver. The sender's identity is returned only after the request has been accepted. Accepted requests can also include a `conversation` ID.

### `PATCH /:id/accept`

The original sender accepts the request. The API returns the updated request and the created/reused `conversationId`.

### `PATCH /:id/reject`

The original sender rejects the request. The identity remains hidden from the requester.

## 8. Conversations — `/api/conversations`

All routes require authentication. A conversation is created as part of accepting an identity request. Only its participants can read or send messages. Conversation message content is trimmed and limited to 1–1000 characters.

### `GET /`

Optional query: `page`, `limit`. Lists conversations for the current user, most recently active first.

### `GET /:id/messages`

Optional query: `page`, `limit`. Lists messages in a conversation in newest-first order. The current user must be a participant.

### `POST /:id/messages`

```json
{ "content": "Hello!" }
```

Creates a message in a conversation where the authenticated user is a participant. Success: HTTP `201`.

## 9. HTTP status and error notes

Common status codes include:

- `400 Bad Request`: invalid JSON, DTO validation failure, malformed ID, or invalid file.
- `401 Unauthorized`: missing, invalid, expired, or revoked authentication cookie.
- `404 Not Found`: unknown route or resource unavailable to the current user.
- `409 Conflict`: duplicate resource such as a repeated identity request or unique-value conflict.
- `413 Payload Too Large`: request body or file exceeds configured limits.
- `429 Too Many Requests`: rate limit, OTP request/attempt limit, or login lock.
- `500 Internal Server Error`: unexpected server-side failure.

Do not rely on the wording of an error message as a stable machine-readable code; the current response contract exposes `message`, `success`, and `correlationId` rather than a dedicated error code.
