# Phase 1 Implementation

## Objective

Build the core user platform where users can submit suspicious content, store it as a chat-like conversation, review previous conversations, and report a full conversation to an officer.

## Implemented

- User authentication with email and password
- OTP-based email verification for registration using Nodemailer SMTP
- Password hashing with bcrypt
- Signed HTTP-only session cookie
- Prisma schema for users, officers, conversations, messages, extracted URLs, analysis results, reports, and officer notes
- Dashboard for saved conversations
- New analysis form
- Conversation detail screen
- URL extraction from pasted text
- Placeholder analysis result for future ML integration
- Report-to-officer incident creation

## Important Product Decision

WhatsApp conversations and web conversations use the same `Conversation` and `Message` tables. This keeps WhatsApp as an input channel, not a separate product silo.

Future n8n workflow:

```text
WhatsApp message
  -> Meta WhatsApp Cloud API
  -> n8n webhook
  -> POST /api/conversations or future channel endpoint
  -> MySQL conversation storage
  -> Response back through n8n
```

## Current API Surface

```http
POST /api/auth/register
POST /api/auth/register/request-otp
POST /api/auth/register/verify-otp
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/conversations
POST /api/conversations
GET  /api/conversations/:id
POST /api/conversations/:id/messages
POST /api/conversations/:id/report
```

## Production Notes

- Replace `AUTH_SECRET` with a strong random value before deployment.
- Keep `DATABASE_URL` out of source control.
- Configure real SMTP credentials before enabling public registration.
- Run Prisma migrations against a managed MySQL database in production.
- Add rate limiting before exposing auth or WhatsApp endpoints publicly.
- Add CSRF protection if browser-origin POSTs expand beyond this controlled app.
- Add officer authentication and role-based access in the officer dashboard phase.
