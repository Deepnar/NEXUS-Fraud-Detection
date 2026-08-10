import { jsonError, jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/admin/overview — system health and volume stats (admin only). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Forbidden", 403);
  }

  const [
    officers,
    users,
    conversations,
    incidentsByStatus,
    pendingHighRisk,
    unreadNotifications,
    auditEntries,
    failedJobs,
  ] = await Promise.all([
    prisma.officer.count(),
    prisma.user.count(),
    prisma.conversation.count(),
    prisma.incidentReport.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.incidentReport.count({
      where: {
        status: { in: ["PENDING", "INVESTIGATING"] },
        conversation: {
          analysisResults: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        },
      },
    }),
    prisma.notification.count({ where: { readAt: null } }),
    prisma.auditLog.count(),
    prisma.analysisJob.count({ where: { status: "FAILED" } }),
  ]);

  return jsonOk({
    stats: {
      officers,
      users,
      conversations,
      incidentsByStatus,
      pendingHighRisk,
      unreadNotifications,
      auditEntries,
      failedJobs,
    },
  });
}
