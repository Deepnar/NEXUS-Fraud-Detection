import { NextResponse } from "next/server";
import { ingestWhatsappMessage } from "@/lib/ingest";
import { verifyIngestRequest } from "@/lib/n8n-auth";
import { clientIp, ingestRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Automation ingest endpoint for the n8n "NEXUS Fraud WhatsApp AI"
 * workflow. GET is a health/verification probe; POST ingests a normalized
 * WhatsApp message. Protected by WHATSAPP_INGEST_SECRET (shared secret
 * header, optional HMAC signature with replay protection) and rate limited.
 */
export async function GET(request: Request) {
  const body = "";
  const auth = verifyIngestRequest(request, body);
  if (!auth.ok) {
    return jsonError(auth.reason, auth.status);
  }

  const limit = await ingestRateLimiter.check(rateLimitKey(request, "probe"));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  return jsonOk({
    ok: true,
    service: "nexus-whatsapp-ingest",
    version: "1.0.0",
    workflowVersion: "1",
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = verifyIngestRequest(request, rawBody);
  if (!auth.ok) {
    return jsonError(auth.reason, auth.status);
  }

  const limit = await ingestRateLimiter.check(rateLimitKey(request, "ingest"));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  try {
    const outcome = await ingestWhatsappMessage(payload, {
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk(
      {
        ok: true,
        duplicate: outcome.duplicate,
        conversationId: outcome.conversationId,
        messageId: outcome.messageId,
        conversationCreated: outcome.conversationCreated,
        analysis: outcome.analysis,
        fallbackReply: outcome.fallbackReply,
      },
      { status: outcome.duplicate ? 200 : 201 }
    );
  } catch (error) {
    await logAudit({
      actorType: "AUTOMATION",
      action: "whatsapp.ingest.failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipHash: hashIp(clientIp(request)),
    });
    const status = error instanceof Error && error.name === "ZodError" ? 400 : 422;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not process message",
      },
      { status }
    );
  }
}
