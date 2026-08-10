import { jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analysisRateLimiter, clientIp, rateLimitKey } from "@/lib/rate-limiter";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { hashIp, logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/** POST /api/analysis/:id/retry — re-run the analysis for a conversation. */
export async function POST(request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const limit = analysisRateLimiter.check(rateLimitKey(request, `${user.id}:retry`));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  const { id } = await params;

  const analysis = await prisma.analysisResult.findFirst({
    where: { id, conversation: { userId: user.id } },
    select: { id: true, conversationId: true },
  });

  if (!analysis) {
    return jsonError("Analysis not found", 404);
  }

  try {
    const result = await runAnalysisPipeline({
      conversationId: analysis.conversationId,
      idempotencyKey: `web:${analysis.conversationId}:retry:${Date.now()}`,
    });

    const full = await prisma.analysisResult.findUnique({
      where: { id: result.id },
      include: { indicators: true, urlChecks: true },
    });

    await logAudit({
      actorType: "USER",
      actorId: user.id,
      action: "analysis.retry",
      targetType: "conversation",
      targetId: analysis.conversationId,
      metadata: { analysisResultId: result.id },
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({ analysis: full });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Analysis retry failed",
      422
    );
  }
}
