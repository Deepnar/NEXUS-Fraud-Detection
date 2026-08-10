import { ConversationSource, MessageSender } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  databaseSchemaMissingMessage,
  databaseUnavailableMessage,
  isDatabaseSchemaMissing,
  isDatabaseUnavailable,
} from "@/lib/db-errors";
import { prisma } from "@/lib/prisma";
import { extractUrls, titleFromMessage } from "@/lib/url-extraction";
import { analysisRateLimiter, rateLimitKey } from "@/lib/rate-limiter";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";

const createConversationSchema = z.object({
  source: z.nativeEnum(ConversationSource).default(ConversationSource.WEB),
  message: z.string().trim().min(1, "Message is required").max(10000),
  externalSenderId: z.string().trim().max(120).optional(),
  platformMessageId: z.string().trim().max(160).optional(),
});

export async function GET() {
  const session = await getSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        extractedUrls: true,
        analysisResults: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        incidentReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return jsonOk({ conversations });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return jsonError(databaseUnavailableMessage(), 503);
    }

    if (isDatabaseSchemaMissing(error)) {
      return jsonError(databaseSchemaMissingMessage(), 503);
    }

    return jsonError("Could not load conversations", 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const limit = analysisRateLimiter.check(rateLimitKey(request, session.userId));
  if (!limit.ok) {
    return jsonError("Rate limit exceeded", 429);
  }

  try {
    const body = createConversationSchema.parse(await request.json());
    const extractedUrls = extractUrls(body.message);

    const conversation = await prisma.conversation.create({
      data: {
        userId: session.userId,
        source: body.source,
        externalSenderId: body.externalSenderId,
        title: titleFromMessage(body.message),
        messages: {
          create: {
            sender: MessageSender.USER,
            content: body.message,
            platformMessageId: body.platformMessageId,
          },
        },
        extractedUrls: {
          create: extractedUrls,
        },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        extractedUrls: true,
      },
    });

    // Run the real analysis pipeline (deterministic rules + optional AI
    // explanation) instead of the old placeholder result.
    const analysis = await runAnalysisPipeline({
      conversationId: conversation.id,
      idempotencyKey: `web:${conversation.id}:initial`,
      messageContent: body.message,
    });

    const fullAnalysis = await prisma.analysisResult.findUnique({
      where: { id: analysis.id },
      include: { indicators: true, urlChecks: true },
    });

    return jsonOk({ conversation, analysis: fullAnalysis }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return jsonError(databaseUnavailableMessage(), 503);
    }

    if (isDatabaseSchemaMissing(error)) {
      return jsonError(databaseSchemaMissingMessage(), 503);
    }

    return jsonError(parseJsonError(error), 400);
  }
}
