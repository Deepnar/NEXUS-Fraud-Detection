import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Authentication for n8n automation endpoints (POST /api/n8n/*).
 *
 * Primary: shared secret via the `x-nexus-ingest-secret` header, compared
 * in constant time. Optional: HMAC-SHA256 signature over `timestamp.body`
 * with replay protection, using the same secret. Both headers are set by
 * the n8n "NEXUS WhatsApp Ingest" credential.
 */

const MAX_SKEW_MS = 5 * 60 * 1000;

export function verifyIngestRequest(
  request: Request,
  body: string
): { ok: true } | { ok: false; reason: string; status: number } {
  if (!env.WHATSAPP_INGEST_SECRET) {
    return {
      ok: false,
      reason: "WHATSAPP_INGEST_SECRET is not configured on the server.",
      status: 503,
    };
  }

  const secret = env.WHATSAPP_INGEST_SECRET;

  const headerSecret = request.headers.get("x-nexus-ingest-secret") ?? "";
  if (!safeEqual(headerSecret, secret)) {
    return { ok: false, reason: "Invalid ingest secret.", status: 401 };
  }

  const timestamp = request.headers.get("x-nexus-timestamp");
  const signature = request.headers.get("x-nexus-signature");

  // HMAC signature is optional but recommended; when present it must verify
  // and must be fresh (replay protection).
  if (timestamp && signature) {
    const now = Date.now();
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) {
      return { ok: false, reason: "Request timestamp is not fresh.", status: 401 };
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    if (!safeEqual(signature.toLowerCase(), expected)) {
      return { ok: false, reason: "Invalid request signature.", status: 401 };
    }
  }

  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
