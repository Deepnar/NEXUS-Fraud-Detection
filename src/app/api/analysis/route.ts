import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analysisRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { hashIp, logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/analysis — run (or re-run) the fraud-analysis pipeline for a
 * conversation owned by the signed-in user. Idempotent when the caller
 * supplies an idempotencyKey; otherwise a fresh analysis is created.
 */
const runAnalysisSchema = z.object({
  conversationId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const limit = await analysisRateLimiter.check(rateLimitKey(request, user.id));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  let body: z.infer<typeof runAnalysisSchema>;
  try {
    body = runAnalysisSchema.parse(await request.json());
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: body.conversationId, userId: user.id },
    select: { id: true },
  });

  if (!conversation) {
    return jsonError("Conversation not found", 404);
  }

  try {
    const result = await runAnalysisPipeline({
      conversationId: conversation.id,
      idempotencyKey:
        body.idempotencyKey ?? `web:${conversation.id}:${Date.now()}`,
    });

    const full = await prisma.analysisResult.findUnique({
      where: { id: result.id },
      include: {
        indicators: true,
        urlChecks: true,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: user.id,
      action: "analysis.run",
      targetType: "conversation",
      targetId: conversation.id,
      metadata: {
        analysisResultId: result.id,
        riskLevel: result.riskLevel,
        score: result.score,
      },
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({ analysis: full }, { status: 201 });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Analysis failed",
      422
    );
  }
}
