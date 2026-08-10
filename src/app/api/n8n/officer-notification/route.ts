import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIngestRequest } from "@/lib/n8n-auth";
import { clientIp, ingestRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Automation endpoint for operational notifications (e.g. n8n workflow
 * failures that need officer attention). Creates a Notification for every
 * officer (broadcast) or for a specific officer when targetOfficerId is
 * supplied. Audit-logged with workflow/execution attribution.
 */
const notificationSchema = z
  .object({
    type: z.string().min(1).max(100).default("operational"),
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(5000),
    targetOfficerId: z.string().max(64).optional(),
    workflowId: z.string().max(200).optional(),
    executionId: z.string().max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = verifyIngestRequest(request, rawBody);
  if (!auth.ok) {
    return jsonError(auth.reason, auth.status);
  }

  const limit = await ingestRateLimiter.check(rateLimitKey(request, "notification"));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  let parsed: z.infer<typeof notificationSchema>;
  try {
    parsed = notificationSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    return jsonError(
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid payload"
        : "Invalid JSON body",
      400
    );
  }

  try {
    let officerIds: string[] = [];
    if (parsed.targetOfficerId) {
      officerIds = [parsed.targetOfficerId];
    } else {
      const officers = await prisma.officer.findMany({ select: { id: true } });
      officerIds = officers.map((o) => o.id);
    }

    if (officerIds.length === 0) {
      return jsonOk({ ok: true, created: 0, note: "No officers configured" });
    }

    const created = await prisma.notification.createMany({
      data: officerIds.map((officerId) => ({
        officerId,
        type: parsed.type,
        title: parsed.title,
        body: `${parsed.body}\n\nworkflow: ${parsed.workflowId ?? "unknown"}\nexecution: ${
          parsed.executionId ?? "unknown"
        }`,
        deliveryStatus: "PENDING",
      })),
    });

    await logAudit({
      actorType: "AUTOMATION",
      actorId: parsed.workflowId,
      action: "notification.created",
      targetType: "notification",
      metadata: {
        type: parsed.type,
        workflowId: parsed.workflowId ?? null,
        executionId: parsed.executionId ?? null,
        recipients: officerIds.length,
      },
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({ ok: true, created: created.count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create notification",
      },
      { status: 500 }
    );
  }
}
