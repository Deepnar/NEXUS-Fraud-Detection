import { TransactionType } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  databaseSchemaMissingMessage,
  databaseUnavailableMessage,
  isDatabaseSchemaMissing,
  isDatabaseUnavailable,
} from "@/lib/db-errors";
import { prisma } from "@/lib/prisma";
import { transactionRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { runTransactionPipeline } from "@/lib/analysis/transaction/pipeline";

export const transactionInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero").max(1_000_000_000),
  currency: z.string().trim().max(8).default("INR"),
  txnType: z.nativeEnum(TransactionType).default(TransactionType.UPI),
  senderRef: z.string().trim().max(120).optional(),
  receiverRef: z.string().trim().max(120).optional(),
  receiverName: z.string().trim().max(120).optional(),
  merchant: z.string().trim().max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  occurredAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().max(160).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const transactions = await prisma.transactionCheck.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        incidentReports: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return jsonOk({ transactions });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return jsonError(databaseUnavailableMessage(), 503);
    if (isDatabaseSchemaMissing(error)) return jsonError(databaseSchemaMissingMessage(), 503);
    return jsonError("Could not load transactions", 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const limit = await transactionRateLimiter.check(rateLimitKey(request, session.userId));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  try {
    const body = transactionInputSchema.parse(await request.json());
    const created = await prisma.transactionCheck.create({
      data: {
        userId: session.userId,
        amount: body.amount,
        currency: body.currency.toUpperCase(),
        txnType: body.txnType,
        senderRef: body.senderRef,
        receiverRef: body.receiverRef,
        receiverName: body.receiverName,
        merchant: body.merchant,
        description: body.description,
        occurredAt: body.occurredAt,
        idempotencyKey: body.idempotencyKey ?? `web:txn:${session.userId}:${Date.now()}`,
      },
    });

    const analysis = await runTransactionPipeline({
      transactionCheckId: created.id,
      idempotencyKey: `${created.idempotencyKey}:analysis`,
    });

    await logAudit({
      actorType: "USER",
      actorId: session.userId,
      action: "transaction.checked",
      targetType: "transaction",
      targetId: created.id,
      metadata: { riskLevel: analysis.riskLevel, score: analysis.score },
    });

    return jsonOk({ transaction: analysis }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return jsonError(databaseUnavailableMessage(), 503);
    if (isDatabaseSchemaMissing(error)) return jsonError(databaseSchemaMissingMessage(), 503);
    return jsonError(parseJsonError(error), 400);
  }
}
