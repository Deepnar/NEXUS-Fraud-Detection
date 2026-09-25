import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { transactionRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { runTransactionPipeline } from "@/lib/analysis/transaction/pipeline";

type Params = {
  params: Promise<{ id: string }>;
};

/** POST /api/transactions/[id]/retry — re-run scoring (owner only). */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const limit = await transactionRateLimiter.check(rateLimitKey(request, `retry:${session.userId}`));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  try {
    const { id } = await params;
    const check = await prisma.transactionCheck.findFirst({
      where: { id, userId: session.userId },
      select: { id: true, idempotencyKey: true },
    });
    if (!check) {
      return jsonError("Transaction check not found", 404);
    }

    const analysis = await runTransactionPipeline({
      transactionCheckId: check.id,
      idempotencyKey: `${check.idempotencyKey}:retry:${Date.now()}`,
    });

    await logAudit({
      actorType: "USER",
      actorId: session.userId,
      action: "transaction.retry",
      targetType: "transaction",
      targetId: check.id,
      metadata: { riskLevel: analysis.riskLevel, score: analysis.score },
    });

    return jsonOk({ transaction: analysis });
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }
}
