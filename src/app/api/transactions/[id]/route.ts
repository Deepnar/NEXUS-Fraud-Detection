import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

/** GET /api/transactions/[id] — one check with its reports (owner only). */
export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;
  const check = await prisma.transactionCheck.findFirst({
    where: { id, userId: session.userId },
    include: {
      incidentReports: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!check) {
    return jsonError("Transaction check not found", 404);
  }

  return jsonOk({ transaction: check });
}
