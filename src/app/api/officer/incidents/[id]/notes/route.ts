import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { clientIp } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const noteSchema = z.object({
  note: z.string().trim().min(1, "Note is required").max(5000),
});

/** POST /api/officer/incidents/:id/notes — internal case notes. */
export async function POST(request: Request, { params }: Params) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;
  let body: z.infer<typeof noteSchema>;
  try {
    body = noteSchema.parse(await request.json());
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

  const note = await prisma.officerNote.create({
    data: {
      incidentReportId: id,
      officerId: officer.id,
      note: body.note,
    },
    include: { officer: { select: { id: true, name: true } } },
  });

  await logAudit({
    actorType: "OFFICER",
    actorId: officer.id,
    action: "incident.note",
    targetType: "incident",
    targetId: id,
    metadata: { noteId: note.id },
    ipHash: hashIp(clientIp(request)),
  });

  return jsonOk({ note }, { status: 201 });
}
