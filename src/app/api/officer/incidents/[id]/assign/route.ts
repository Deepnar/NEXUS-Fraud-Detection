import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { clientIp } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  officerId: z.string().min(1).max(64),
});

/** POST /api/officer/incidents/:id/assign — claim or reassign a case. */
export async function POST(request: Request, { params }: Params) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;
  let body: z.infer<typeof assignSchema>;
  try {
    body = assignSchema.parse(await request.json());
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }

  const incident = await prisma.incidentReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!incident) {
    return jsonError("Incident not found", 404);
  }

  const target = await prisma.officer.findUnique({
    where: { id: body.officerId },
    select: { id: true },
  });
  if (!target) {
    return jsonError("Officer not found", 404);
  }

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.incidentAssignment.deleteMany({ where: { incidentReportId: id } });
    return tx.incidentAssignment.create({
      data: {
        incidentReportId: id,
        officerId: body.officerId,
        assignedBy: officer.id,
      },
      include: { officer: { select: { id: true, name: true } } },
    });
  });

  await logAudit({
    actorType: "OFFICER",
    actorId: officer.id,
    action: "incident.assign",
    targetType: "incident",
    targetId: id,
    metadata: { toOfficerId: body.officerId },
    ipHash: hashIp(clientIp(request)),
  });

  return jsonOk({ assignment });
}
