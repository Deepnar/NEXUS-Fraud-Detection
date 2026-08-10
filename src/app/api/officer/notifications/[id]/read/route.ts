import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/officer/notifications/:id/read — mark a notification read. */
export async function POST(_request: Request, { params }: Params) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;

  const updated = await prisma.notification.updateMany({
    where: { id, officerId: officer.id, readAt: null },
    data: { readAt: new Date() },
  });

  return jsonOk({ ok: true, updated: updated.count });
}
