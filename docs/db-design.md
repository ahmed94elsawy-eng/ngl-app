# Database Design

## 1. Overview

The application uses MongoDB through Mongoose. The principal persisted entities are `User`, `Message`, `IdentityRequest`, `Conversation`, and `ConversationMessage`. Mongoose adds an `_id` ObjectId to each document and uses timestamps where configured.

The following describes the schemas defined by the current source code. It is documentation, not a database migration script.

## 2. User (`User` model)

| Field | Type | Constraints / behavior |
|---|---|---|
| `_id` | ObjectId | Mongoose-generated primary identifier |
| `name` | String | Required; trimmed; 3–20 characters |
| `email` | String | Required; trimmed, lowercased, unique |
| `password` | String | Required only for `provider: "local"`; bcrypt hash; excluded from normal queries with `select: false` and removed during JSON serialization |
| `provider` | String | Enum: `local`, `google`, `facebook`; default `local` |
| `isDeleted` | Boolean | Default `false`; soft-delete flag |
| `isVerified` | Boolean | Default `false`; set after email verification. Google-created accounts are treated as verified after Google's token is validated |
| `twoFactorEnabled` | Boolean | Default `false` |
| `changeCredentialsTime` | Date | Invalidates tokens issued before the recorded time, e.g. password reset or logout from all devices |
| `dob` | Date | Optional |
| `gender` | String | Enum `male` or `female`; default `male` |
| `profilePicPath` | String | Stored profile image path |
| `coverImagePaths` | Array of String | Stored cover-image paths |
| `cvPath` | String | Stored CV path |
| `createdAt` | Date | Added automatically by Mongoose timestamps |
| `updatedAt` | Date | Added automatically by Mongoose timestamps |

**Security and implementation notes**

- The `email` field has a unique constraint; duplicate email insertions can produce MongoDB duplicate-key errors.
- `password` contains a password hash, not the original password.
- `facebook` is allowed as a schema enum value, but the current API does not implement Facebook authentication.
- The schema has `isDeleted`, but a public user-delete endpoint is not currently registered.

## 3. Message (`Message` model)

| Field | Type | Constraints / behavior |
|---|---|---|
| `_id` | ObjectId | Primary identifier |
| `content` | String | Required; trimmed; 1–200 characters |
| `receiver` | ObjectId | Required; references `User` |
| `sender` | ObjectId | Optional; references `User`; excluded from normal queries with `select: false` |
| `isDeleted` | Boolean | Default `false`; inbox deletion is a soft delete |
| `createdAt` | Date | Automatic timestamp |
| `updatedAt` | Date | Automatic timestamp |

`sender` is absent for a truly anonymous message. For messages sent through the authenticated `/api/message/public` endpoint, the sender is stored internally so an identity request can be handled later. The API's public message serializer intentionally omits the sender.

**Index**

- `{ receiver: 1, isDeleted: 1, createdAt: -1, _id: -1 }` — supports inbox filtering and newest-first pagination.

## 4. IdentityRequest (`IdentityRequest` model)

Tracks a receiver's request to reveal the sender of a message.

| Field | Type | Constraints / behavior |
|---|---|---|
| `_id` | ObjectId | Primary identifier |
| `message` | ObjectId | Required; references `Message`; one request per message |
| `receiver` | ObjectId | Required; references `User`; the person who received the message and asks who sent it |
| `sender` | ObjectId | Required; references `User`; the original sender who makes the accept/reject decision |
| `status` | String | Enum `pending`, `accepted`, `rejected`; default `pending` |
| `respondedAt` | Date | Optional; set when the request is answered if the transition code supplies it |
| `createdAt` | Date | Automatic timestamp |
| `updatedAt` | Date | Automatic timestamp |

**Indexes**

- `{ message: 1 }` with `unique: true` — prevents duplicate identity requests for one message.
- `{ sender: 1, status: 1, createdAt: -1 }` — supports requests received by the original sender.
- `{ receiver: 1, createdAt: -1 }` — supports requests made by the receiver.

**Privacy rule:** the requester's view does not include the sender's identity while status is `pending` or `rejected`. The identity and conversation ID are included only for an accepted request.

## 5. Conversation (`Conversation` model)

A conversation represents private communication created after an identity request is accepted.

| Field | Type | Constraints / behavior |
|---|---|---|
| `_id` | ObjectId | Primary identifier |
| `message` | ObjectId | Required; references the original `Message`; one conversation per original message |
| `participants` | Array of ObjectId | References `User`; expected to contain the two users involved (original sender and receiver) |
| `lastMessageAt` | Date | Defaults to the current date; updated when a message is sent to sort conversation lists |
| `createdAt` | Date | Automatic timestamp |
| `updatedAt` | Date | Automatic timestamp |

**Indexes**

- `{ message: 1 }` with `unique: true` — one conversation per original message.
- `{ participants: 1, lastMessageAt: -1 }` — supports listing a user's conversations by most recent activity.

## 6. ConversationMessage (`ConversationMessage` model)

| Field | Type | Constraints / behavior |
|---|---|---|
| `_id` | ObjectId | Primary identifier |
| `conversation` | ObjectId | Required; references `Conversation` |
| `author` | ObjectId | Required; references `User` |
| `content` | String | Required; trimmed; 1–1000 characters |
| `createdAt` | Date | Automatic creation timestamp |

`updatedAt` is intentionally disabled for this schema.

**Index**

- `{ conversation: 1, createdAt: -1, _id: -1 }` — supports listing messages for a conversation, newest first.

## 7. OTP model and current OTP storage

An `OTP` Mongoose model is defined with these fields:

| Field | Type | Constraints / behavior |
|---|---|---|
| `code` | String | Required; length 6 |
| `email` | String | Required; trimmed and lowercased |
| `expiresAt` | Date | Required; TTL index with `expireAfterSeconds: 0` |
| `createdAt` | Date | Added automatically; `updatedAt` is disabled |

**Important implementation detail:** the active OTP service currently uses Redis rather than the `OTP` Mongoose model. It stores an HMAC-SHA256 hash of the code, not the plain code, under purpose-specific Redis keys. Codes currently expire after 180 seconds; requests have a 60-second cooldown, up to 3 requests per 15-minute window, and up to 5 wrong attempts per code. The Mongoose OTP model/repository appears to be legacy or unused by the active service and should not be mistaken for the current OTP persistence path.

## 8. Relationships

```text
User 1 ─── many Message (as receiver)
User 0..1 ─── many Message (as optional sender)
Message 1 ─── 0..1 IdentityRequest
IdentityRequest accepted ─── creates/reuses one Conversation for its Message
Conversation 1 ─── many ConversationMessage
User 1 ─── many ConversationMessage (as author)
```

References are stored as ObjectIds. The application enforces participant/ownership rules in its service/repository layer; MongoDB references alone do not enforce authorization.

## 9. Redis data

Redis is used by the active authentication/security services for short-lived data, including OTP hashes and attempt/request counters, login-lock counters, rate-limit counters, token revocation, and idempotency-related state. Redis key names may be prefixed by `REDIS_KEY_PREFIX` at the client level. Redis contents are operational state, not part of the MongoDB entity relationship model.

## 10. Production data and file-storage notes

- Uploaded files are written to the local `uploads/` directory and only their paths are stored in `User`. Local disk is not shared between EC2 instances and may not be durable across instance replacement; production should use durable storage or object storage such as S3.
- The current Express app publicly serves `/uploads`. CV paths must not remain publicly accessible if they contain private information; implement protected downloads/private object storage before production use.
- Review MongoDB index creation and backup/restore policies for the production database. Do not rely on a unique index until it has successfully been created in the target database.
