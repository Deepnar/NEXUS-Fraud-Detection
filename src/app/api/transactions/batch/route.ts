import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { transactionRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { runTransactionPipeline } from "@/lib/analysis/transaction/pipeline";
import { transactionInputSchema } from "../route";

const batchSchema = z.object({
  batchId: z.string().trim().min(1).max(120),
  rows: transactionInputSchema.omit({ idempotencyKey: true }).array().min(1).max(200),
});

/**
 * POST /api/transactions/batch — CSV-grade batch intake.
 * The browser parses the CSV into rows (no server file handling);
 * each row is scored sequentially with a stable idempotency key so a
 * retried upload never duplicates checks.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const limit = await transactionRateLimiter.check(rateLimitKey(request, `batch:${session.userId}`));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  try {
    const body = batchSchema.parse(await request.json());
    const results: { index: number; id: string; riskLevel: string; score: number | null }[] = [];
    const failures: { index: number; error: string }[] = [];

    for (let index = 0; index < body.rows.length; index++) {
      const row = body.rows[index];
      const idempotencyKey = `batch:${session.userId}:${body.batchId}:${index}`;
      try {
        const created = await prisma.transactionCheck.upsert({
          where: { idempotencyKey },
          create: {
            userId: session.userId,
            amount: row.amount,
            currency: row.currency.toUpperCase(),
            txnType: row.txnType,
            senderRef: row.senderRef,
            receiverRef: row.receiverRef,
            receiverName: row.receiverName,
            merchant: row.merchant,
            description: row.description,
            occurredAt: row.occurredAt,
            idempotencyKey,
          },
          update: {},
        });
        const analysis = await runTransactionPipeline({
          transactionCheckId: created.id,
          idempotencyKey: `${idempotencyKey}:analysis`,
        });
        results.push({
          index,
          id: analysis.id,
          riskLevel: analysis.riskLevel,
          score: analysis.score,
        });
      } catch (error) {
        failures.push({
          index,
          error: error instanceof Error ? error.message.slice(0, 200) : "failed",
        });
      }
    }

    await logAudit({
      actorType: "USER",
      actorId: session.userId,
      action: "transaction.batch",
      targetType: "transaction-batch",
      targetId: body.batchId,
      metadata: { total: body.rows.length, scored: results.length, failed: failures.length },
    });

    return jsonOk({ batchId: body.batchId, results, failures }, { status: 201 });
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }
}
