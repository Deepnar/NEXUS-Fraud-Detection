import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIngestRequest } from "@/lib/n8n-auth";
import { clientIp, ingestRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { AnalysisStatus, MessageSender, MessageType, Prisma } from "@prisma/client";
import { maybeEscalate } from "@/lib/analysis/escalation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * n8n posts the DeepSeek explanation + safe bot reply here after analyzing
 * a WhatsApp message. The deterministic score is preserved; the AI's
 * proposal is stored under providerResults and only used for explanation,
 * recommended review, and disagreement-based escalation.
 */
const analysisResultSchema = z
  .object({
    conversationId: z.string().min(1).max(64).optional(),
    analysisResultId: z.string().min(1).max(64).optional(),
    result: z
      .object({
        riskLevel: z
          .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"])
          .optional(),
        score: z.number().min(0).max(100).optional(),
        confidence: z.number().min(0).max(1).optional(),
        summary: z.string().max(5000).optional(),
        evidence: z.array(z.record(z.string(), z.unknown())).optional(),
        safeNextSteps: z.array(z.string().max(500)).optional(),
        limitations: z.array(z.string().max(500)).optional(),
        modelVersion: z.string().max(200).optional(),
      })
      .optional(),
    replyText: z.string().max(10000).optional(),
    workflowId: z.string().max(200).optional(),
    executionId: z.string().max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = verifyIngestRequest(request, rawBody);
  if (!auth.ok) {
    return jsonError(auth.reason, auth.status);
  }

  const limit = ingestRateLimiter.check(rateLimitKey(request, "analysis-result"));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  let parsed: z.infer<typeof analysisResultSchema>;
  try {
    parsed = analysisResultSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    return jsonError(
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid payload"
        : "Invalid JSON body",
      400
    );
  }

  try {
    const result = await prisma.analysisResult.findFirst({
      where: parsed.analysisResultId
        ? { id: parsed.analysisResultId }
        : {
            conversationId: parsed.conversationId,
            status: AnalysisStatus.COMPLETED,
          },
      orderBy: { createdAt: "desc" },
      include: { conversation: true },
    });

    if (!result) {
      return jsonError("Analysis result not found", 404);
    }

    const ai = parsed.result ?? {};

    const providerResults =
      (result.providerResults as Record<string, unknown> | null) ?? {};
    providerResults.deepseek = {
      status: "ok",
      model: ai.modelVersion ?? "deepseek-v4-flash",
      aiSuggestion: {
        riskLevel: ai.riskLevel,
        score: ai.score,
        confidence: ai.confidence,
      },
      workflowId: parsed.workflowId ?? null,
      executionId: parsed.executionId ?? null,
    };

    const safeNextSteps = [
      ...(ai.safeNextSteps ?? []),
      ...(((result.safeNextSteps as string[] | null) ?? []).filter(
        (s) => !(ai.safeNextSteps ?? []).includes(s)
      )),
    ];

    const limitations = ai.limitations ?? (result.limitations as string[] | null) ?? [];

    const updated = await prisma.analysisResult.update({
      where: { id: result.id },
      data: {
        status: AnalysisStatus.COMPLETED,
        completedAt: new Date(),
        confidence: ai.confidence ?? result.confidence,
        summary: ai.summary ?? result.summary,
        modelVersion: ai.modelVersion ?? result.modelVersion,
        safeNextSteps: safeNextSteps as unknown as Prisma.InputJsonValue,
        limitations: limitations as unknown as Prisma.InputJsonValue,
        providerResults: providerResults as unknown as Prisma.InputJsonValue,
      },
    });

    // Store the approved bot reply (sent back via WhatsApp by n8n).
    let replyMessageId: string | null = null;
    if (parsed.replyText?.trim()) {
      const reply = await prisma.message.create({
        data: {
          conversationId: result.conversationId,
          sender: MessageSender.BOT,
          type: MessageType.TEXT,
          content: parsed.replyText.trim(),
          metadata: {
            provider: "whatsapp",
            workflowId: parsed.workflowId ?? null,
            executionId: parsed.executionId ?? null,
            replyToAnalysisResultId: result.id,
          },
        },
      });
      replyMessageId = reply.id;
    }

    // Escalate on material model-rule disagreement (>= 30 points) even when
    // the deterministic result is low — the case needs a human look.
    const deterministicScore = result.deterministicScore ?? result.score ?? 0;
    const aiScore = ai.score;
    const disagreement =
      typeof aiScore === "number" && Math.abs(aiScore - deterministicScore) >= 30;

    if (disagreement || ai.riskLevel === "HIGH" || ai.riskLevel === "CRITICAL") {
      await maybeEscalate({
        conversationId: result.conversationId,
        riskLevel: result.riskLevel,
        autoReason: `AI explanation diverges from rules: DeepSeek suggested ${
          ai.riskLevel ?? "unknown"
        } (${aiScore ?? "?"}/100) while the rule engine scored ${deterministicScore}/100 (${result.riskLevel}).`,
      });
    }

    await logAudit({
      actorType: "AUTOMATION",
      actorId: parsed.workflowId,
      action: "analysis-result.completed",
      targetType: "analysisResult",
      targetId: result.id,
      metadata: {
        conversationId: result.conversationId,
        model: ai.modelVersion ?? null,
        replyStored: replyMessageId !== null,
        disagreement,
      },
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({
      ok: true,
      analysisResultId: updated.id,
      conversationId: result.conversationId,
      replyMessageId,
      riskLevel: result.riskLevel,
      score: result.score,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not store analysis result",
      },
      { status: 500 }
    );
  }
}
