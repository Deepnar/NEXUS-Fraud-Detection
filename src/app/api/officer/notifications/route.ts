import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/officer/notifications — the officer's notification feed. */
export async function GET() {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { officerId: officer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { officerId: officer.id, readAt: null },
    }),
  ]);

  return jsonOk({ notifications, unread });
}
