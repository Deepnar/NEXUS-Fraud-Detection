import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/officer/officers — officer directory for case assignment. */
export async function GET() {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const officers = await prisma.officer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  return jsonOk({ officers });
}
