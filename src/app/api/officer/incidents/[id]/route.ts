import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/officer/incidents/:id — full investigation workspace data. */
export async function GET(_request: Request, { params }: Params) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;

  const incident = await prisma.incidentReport.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          extractedUrls: true,
          analysisResults: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              indicators: true,
              urlChecks: true,
              job: true,
            },
          },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { officer: { select: { id: true, name: true } } },
      },
      transactionCheck: true,
      assignments: {
        include: { officer: { select: { id: true, name: true, email: true } } },
        take: 1,
      },
    },
  });

  if (!incident) {
    return jsonError("Incident not found", 404);
  }

  return jsonOk({ incident });
}
