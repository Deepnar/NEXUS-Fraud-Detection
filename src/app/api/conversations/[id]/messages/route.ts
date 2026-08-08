import { MessageSender } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractUrls } from "@/lib/url-extraction";

const appendMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(10000),
  platformMessageId: z.string().trim().max(160).optional(),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const session = await getSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const body = appendMessageSchema.parse(await request.json());
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: session.userId },
      select: { id: true },
    });

    if (!conversation) {
      return jsonError("Conversation not found", 404);
    }

    const extractedUrls = extractUrls(body.message);
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: id,
          sender: MessageSender.USER,
          content: body.message,
          platformMessageId: body.platformMessageId,
        },
      });

      for (const extractedUrl of extractedUrls) {
        await tx.extractedUrl.upsert({
          where: {
            conversationId_normalizedUrl: {
              conversationId: id,
              normalizedUrl: extractedUrl.normalizedUrl,
            },
          },
          create: {
            conversationId: id,
            ...extractedUrl,
          },
          update: {},
        });
      }

      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return message;
    });

    return jsonOk({ message: result, extractedUrls }, { status: 201 });
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }
}
