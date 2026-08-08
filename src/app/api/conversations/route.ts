import { ConversationSource, MessageSender } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractUrls, titleFromMessage } from "@/lib/url-extraction";

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
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
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
        analysisResults: {
          create: {
            summary: "Analysis engine is queued for a later phase. Message and URLs were stored successfully.",
            evidence: {
              urlCount: extractedUrls.length,
              phase: "phase-1-storage",
            },
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        extractedUrls: true,
        analysisResults: true,
      },
    });

    return jsonOk({ conversation }, { status: 201 });
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }
}
