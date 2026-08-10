import { jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/analysis/:id — a single analysis with evidence and URL checks. */
export async function GET(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;

  const analysis = await prisma.analysisResult.findFirst({
    where: {
      id,
      conversation: { userId: user.id },
    },
    include: {
      indicators: { orderBy: { id: "asc" } },
      urlChecks: true,
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          extractedUrls: true,
        },
      },
    },
  });

  if (!analysis) {
    return jsonError("Analysis not found", 404);
  }

  return jsonOk({ analysis });
}
