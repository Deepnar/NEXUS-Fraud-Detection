# NEXUS Fraud WhatsApp AI — n8n workflow

Import `nexus-fraud-whatsapp-ai.json` into n8n (Workflows → ⋯ → Import from file).

## What the workflow does

```
WhatsApp Trigger
  -> Normalize WhatsApp Message        (code: Meta event -> NEXUS ingest contract)
  -> Route Text / Unsupported          (branch)
       text      -> NEXUS Ingest        (POST /api/n8n/whatsapp — creates the
                                          conversation, stores the message, runs
                                          the deterministic rule engine, phone-links
                                          the sender to a portal user, and
                                          auto-escalates HIGH/CRITICAL cases)
       unsupported -> WhatsApp Fallback Reply
  -> DeepSeek V4 Flash Fraud Analysis Agent  (explains the deterministic result)
  -> Structured Output Parser           (code: extracts the JSON + builds replyText)
  -> Store Analysis Result + BOT Reply  (POST /api/n8n/analysis-result — persists the
                                          AI explanation without overriding the
                                          deterministic score, stores the BOT message)
  -> WhatsApp Business Cloud Reply      (sends replyText back to the sender)
```

## Credentials to configure in n8n (never in the repository)

| Credential | Where | Notes |
|---|---|---|
| WhatsApp Trigger API | native WhatsApp Trigger node | Meta app + WhatsApp Business Account |
| WhatsApp Business Cloud | WhatsApp reply nodes | For sending messages back |
| DeepSeek account | DeepSeek Chat Model / Agent | `deepseek-v4-flash` model |
| NEXUS WhatsApp Ingest Secret | the three HTTP Request nodes (Header Auth) | `WHATSAPP_INGEST_SECRET` from the NEXUS `.env` |

## Environment variables (n8n)

| Variable | Value |
|---|---|
| `NEXUS_BASE_URL` | the public HTTPS URL of the NEXUS app, e.g. `https://nexus.example.com` |

## Meta WhatsApp Business Cloud setup

1. Create/select a Meta developer app and add the WhatsApp Business Platform product.
2. Connect a WhatsApp Business Account and a phone number.
3. Configure the native WhatsApp Trigger credential in n8n.
4. Activate the workflow so Meta can register the callback URL.
5. Subscribe the app to the `messages` field.
6. Send a test WhatsApp message to the business number and confirm: n8n receives
   the event → NEXUS creates the conversation → DeepSeek replies → the reply is
   stored and sent back → the linked portal user sees the conversation.

The Meta callback must be a public HTTPS URL — localhost will not work for
production webhook registration.

## Failure handling (build these if you want error alerts)

The `node-officer-notify` HTTP Request node is provided for the error path:
POST `/api/n8n/officer-notification` with `type: workflow_failure`, which creates
a notification for every officer. Wire it to the workflow's error output
(Workflow settings → Error Workflow) or from an `Error Trigger` workflow.

Recommended retry policy: bounded exponential backoff on transient NEXUS/provider
failures; never retry invalid payloads indefinitely; preserve the Meta message ID
for idempotency (NEXUS deduplicates on it server-side).
