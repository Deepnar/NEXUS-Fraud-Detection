import { AnalysisStatus, Prisma, TransactionCheck } from "@prisma/client";
import { env } from "@/lib/env";
import { getAiConfig } from "@/lib/ai-provider";
import { prisma } from "@/lib/prisma";
import { explainWithDeepSeek } from "@/lib/deepseek";
import { predictTransaction } from "@/lib/model-api";
import { analyzeTransaction } from "./rules";
import { maybeEscalate } from "../escalation";

export interface TransactionPipelineOptions {
  transactionCheckId: string;
  idempotencyKey: string;
}

function riskRank(level: string): number {
  return { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[level] ?? 0;
}

function txnSummaryInput(check: {
  amount: number;
  currency: string;
  txnType: string;
  receiverName: string | null;
  receiverRef: string | null;
  merchant: string | null;
  description: string | null;
}): string {
  const payee = check.receiverName || check.merchant || check.receiverRef || "unknown payee";
  const base = `Transaction of ${check.currency} ${check.amount} (${check.txnType}) to ${payee}.`;
  return check.description ? `${base} Note: ${check.description}` : base;
}

/**
 * Layered analysis for a transaction check:
 * 1. deterministic txn rules (always)
 * 2. optional XGBoost transaction head (never overrides deterministic score)
 * 3. optional AI explanation (never overrides the score)
 * 4. persistence onto the TransactionCheck row
 * 5. automatic escalation of HIGH/CRITICAL or model-rule disagreement
 *
 * Idempotent per idempotencyKey.
 */
export async function runTransactionPipeline(
  opts: TransactionPipelineOptions
): Promise<TransactionCheck> {
  const existing = await prisma.transactionCheck.findUnique({
    where: { idempotencyKey: opts.idempotencyKey },
  });
  if (existing && existing.status === AnalysisStatus.COMPLETED) {
    return existing;
  }

  const check =
    existing ??
    (await prisma.transactionCheck.findUniqueOrThrow({
      where: { id: opts.transactionCheckId },
    }));

  await prisma.transactionCheck.update({
    where: { id: check.id },
    data: { attempts: { increment: 1 }, status: AnalysisStatus.PENDING },
  });

  try {
    const occurredAt = check.occurredAt ?? check.createdAt;
    const hour = String(occurredAt.getHours()).padStart(2, "0");
    const minute = String(occurredAt.getMinutes()).padStart(2, "0");

    const deterministic = analyzeTransaction({
      amount: check.amount,
      currency: check.currency,
      txnType: check.txnType,
      receiverRef: check.receiverRef,
      receiverName: check.receiverName,
      merchant: check.merchant,
      description: check.description,
      occurredAt,
    });

    // Optional ML head. Non-fatal; deterministic rules stand alone.
    const model = await predictTransaction({
      requestId: `txn:${check.id}`,
      transaction: {
        Amount: check.amount,
        Time: `${hour}:${minute}`,
        Year: occurredAt.getFullYear(),
        Month: occurredAt.getMonth() + 1,
        Day: occurredAt.getDate(),
        MCC: 0,
        "Use Chip": check.txnType === "CARD" ? "Swipe Transaction" : "Online Transaction",
      },
    });

    const aiConfig = await getAiConfig();
    const ai = aiConfig
      ? await explainWithDeepSeek({
          text: txnSummaryInput(check),
          urls: [],
          deterministic,
        })
      : null;

    const providerResults: Record<string, unknown> = {};
    if (model) {
      providerResults.xgboost = { status: "ok", transaction: model };
    } else if (env.MODEL_API_URL) {
      providerResults.xgboost = {
        status: "unavailable",
        note: "Model API did not return a prediction; deterministic result used.",
      };
    }
    if (ai) {
      providerResults.ai = {
        status: "ok",
        model: ai.modelVersion,
        aiSuggestion: {
          riskLevel: ai.proposedRiskLevel,
          score: ai.proposedScore,
          confidence: ai.confidence,
        },
        disagreement: ai.disagreement,
      };
    } else if (aiConfig) {
      providerResults.ai = {
        status: "unavailable",
        note: "AI explanation was not produced; deterministic result used.",
      };
    }

    const topEvidence = deterministic.evidence.slice(0, 3).map((e) => e.description);
    const summary =
      ai?.summary ??
      `This transaction scored ${deterministic.score}/100 (${deterministic.riskLevel} risk).` +
        (topEvidence.length > 0 ? ` Reasons: ${topEvidence.join(" ")}` : " No strong scam signals were detected.");

    const updated = await prisma.transactionCheck.update({
      where: { id: check.id },
      data: {
        status: AnalysisStatus.COMPLETED,
        riskLevel: deterministic.riskLevel as TransactionCheck["riskLevel"],
        score: deterministic.score,
        deterministicScore: deterministic.score,
        confidence:
          ai?.confidence ?? (model?.calibrated ? model.probability : null),
        summary,
        evidence: deterministic.evidence as unknown as Prisma.InputJsonValue,
        safeNextSteps: deterministic.safeNextSteps as unknown as Prisma.InputJsonValue,
        limitations: (ai?.limitations ?? []) as unknown as Prisma.InputJsonValue,
        providerResults: providerResults as unknown as Prisma.InputJsonValue,
        modelVersion:
          ai?.modelVersion ?? model?.modelVersion ?? deterministic.modelVersion,
        ruleVersion: deterministic.ruleVersion,
        completedAt: new Date(),
      },
    });

    await maybeEscalate({
      transactionCheckId: check.id,
      userId: check.userId,
      riskLevel: deterministic.riskLevel,
      reason:
        deterministic.riskLevel === "HIGH" || deterministic.riskLevel === "CRITICAL"
          ? "Automatically escalated based on transaction risk."
          : undefined,
      autoReason: ai?.disagreement
        ? `Model-rule disagreement: AI suggested ${ai.proposedRiskLevel} (${ai.proposedScore}/100) while rules scored ${deterministic.score}/100 (${deterministic.riskLevel}).`
        : model && riskRank(model.riskLevel) >= 3 && riskRank(model.riskLevel) > riskRank(deterministic.riskLevel)
          ? `XGBoost disagreement: model predicted ${model.riskLevel} (${Math.round(model.probability * 100)}%) while deterministic rules scored ${deterministic.score}/100 (${deterministic.riskLevel}).`
          : undefined,
    });

    return updated;
  } catch (error) {
    await prisma.transactionCheck.update({
      where: { id: check.id },
      data: {
        status: AnalysisStatus.FAILED,
        failureCode: error instanceof Error ? error.message.slice(0, 191) : "unknown",
      },
    });
    throw error;
  }
}
