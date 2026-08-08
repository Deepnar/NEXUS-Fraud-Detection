# NEXUS Fraud Detection

Explainable AI-based phishing and digital fraud reporting platform.

This repository currently contains the Phase 1 production foundation:

- User registration and login
- HTTP-only cookie sessions
- SMTP OTP-based registration
- Conversation dashboard
- New suspicious-message analysis flow
- URL extraction and normalization
- Chat-like conversation storage
- Report-to-officer incident creation
- Prisma/MySQL data model designed for web and future WhatsApp input

## Tech Stack

- Next.js App Router
- TypeScript
- Prisma ORM
- MySQL 8
- Zod validation
- JWT sessions with HTTP-only cookies

## Local Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy environment variables:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Start MySQL:

   ```powershell
   docker compose up -d mysql
   ```

4. Configure SMTP in `.env`.

   Required for registration OTP:

   ```text
   SMTP_HOST
   SMTP_PORT
   SMTP_SECURE
   SMTP_USER
   SMTP_PASS
   SMTP_FROM
   ```

5. Generate Prisma and apply migrations:

   ```powershell
   npx prisma generate
   npx prisma migrate dev --name init
   ```

6. Run the app:

   ```powershell
   npm run dev
   ```

7. Open:

   ```text
   http://localhost:3000
   ```

## Phase 1 Demo Flow

1. Register a user.
2. Enter the OTP sent through SMTP.
3. Open **New Analysis**.
4. Paste a suspicious message such as:

   ```text
   URGENT! Your account will be blocked. Verify KYC at https://fake-bank-login.com
   ```

5. The app saves the conversation.
6. The app extracts and stores the URL.
7. The dashboard shows the saved conversation.
8. Open the conversation and click **Report To Officer**.

## Database Runtime Fix

If registration fails with `Can't reach database server at localhost:3306`, start MySQL and apply the migration:

```powershell
docker compose up -d mysql
npx prisma migrate dev
npm run dev
```

## Next Phase

Phase 2 should connect n8n and Meta WhatsApp Cloud API to the existing conversation API. n8n should call the backend instead of storing core data itself.
