import { z } from "zod";
import { IncidentStatus } from "@prisma/client";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { clientIp } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const statusSchema = z.object({
  status: z.nativeEnum(IncidentStatus),
  reason: z.string().trim().max(2000).optional(),
});

/** POST /api/officer/incidents/:id/status — transition an incident. */
export async function POST(request: Request, { params }: Params) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;
  let body: z.infer<typeof statusSchema>;
  try {
    body = statusSchema.parse(await request.json());
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }

  // Destructive/terminal transitions require a reason (auditable).
  if (
    (body.status === IncidentStatus.RESOLVED ||
      body.status === IncidentStatus.FALSE_POSITIVE) &&
    !body.reason
  ) {
    return jsonError("A reason is required to resolve or mark false positive.", 422);
  }

  const existing = await prisma.incidentReport.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return jsonError("Incident not found", 404);
  }

  const incident = await prisma.incidentReport.update({
    where: { id },
    data: { status: body.status },
  });

  await logAudit({
    actorType: "OFFICER",
    actorId: officer.id,
    action: "incident.status",
    targetType: "incident",
    targetId: id,
    metadata: {
      from: existing.status,
      to: body.status,
      reason: body.reason ?? null,
    },
    ipHash: hashIp(clientIp(request)),
  });

  return jsonOk({ incident });
}
