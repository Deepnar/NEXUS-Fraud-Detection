import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Security audit logging.
 *
 * Every sensitive action (auth, officer mutations, reports, ingest) is
 * recorded with an actor, action, target, structured metadata, and a hash
 * of the client IP. Never store raw IPs, secrets, message contents, or
 * credentials in the audit log.
 */

export type AuditActorType = "USER" | "OFFICER" | "SYSTEM" | "AUTOMATION";

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? null) as never,
        ipHash: entry.ipHash ?? null,
      },
    });
  } catch {
    // Audit logging must never break the primary request.
  }
}

/** Redact common secrets from any string before logging. */
export function redact(value: string): string {
  return value
    .replace(/\b\d{6}\b/g, "[OTP]")
    .replace(/\b\d{16}\b/g, "[CARD]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:\+?\d[\d -]{8,}\d)\b/g, "[PHONE]");
}
