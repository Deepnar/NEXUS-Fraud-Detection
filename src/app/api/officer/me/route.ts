import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const unreadCount = await prisma.notification.count({
    where: { officerId: officer.id, readAt: null },
  });

  return jsonOk({
    officer,
    unreadNotifications: unreadCount,
  });
}
