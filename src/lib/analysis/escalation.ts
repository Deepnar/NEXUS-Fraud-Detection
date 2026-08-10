import { IncidentOrigin, IncidentStatus, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Layer 5 of the fraud-detection engine: human review escalation.
 *
 * Creates an IncidentReport (origin AUTO) when a case needs officer
 * attention: HIGH/CRITICAL risk, or an explicit reason (e.g. model-rule
 * disagreement). Never duplicates an open report for the same conversation.
 */
export async function maybeEscalate(params: {
  conversationId: string;
  userId?: string | null;
  riskLevel?: string;
  reason?: string;
  autoReason?: string;
}): Promise<{ id: string } | null> {
  const needsReview =
    params.reason !== undefined ||
    params.riskLevel === "HIGH" ||
    params.riskLevel === "CRITICAL";

  if (!needsReview) {
    return null;
  }

  const existing = await prisma.incidentReport.findFirst({
    where: {
      conversationId: params.conversationId,
      status: { in: [IncidentStatus.PENDING, IncidentStatus.INVESTIGATING] },
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.incidentReport.create({
    data: {
      conversationId: params.conversationId,
      userId: params.userId ?? null,
      reason:
        params.reason ??
        "Automatically escalated based on risk analysis.",
      origin: IncidentOrigin.AUTO,
      autoReason: params.autoReason ?? null,
    },
    select: { id: true },
  });
}
