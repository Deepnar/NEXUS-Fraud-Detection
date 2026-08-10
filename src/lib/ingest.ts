import {
  AnalysisStatus,
  ConversationSource,
  ConversationStatus,
  MessageSender,
  MessageType,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { phonesMatch } from "@/lib/phone";
import { extractUrls, titleFromMessage } from "@/lib/url-extraction";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { logAudit } from "@/lib/audit";

/**
 * WhatsApp ingest: normalized events pushed by the n8n "NEXUS Fraud
 * WhatsApp AI" workflow.
 *
 * Contract (normalized by n8n, not the raw Meta payload):
 * {
 *   "event": "message",
 *   "from": { "phone": "919876543210", "name": "Rishit" },
 *   "message": { "id": "wamid.HBg...", "type": "text", "text": { "body": "..." }, "timestamp": "1720000000" },
 *   "businessPhoneNumberId": "1234567890"
 * }
 */

const whatsappMessageSchema = z
  .object({
    event: z.string().default("message"),
    from: z
      .object({
        phone: z.string().min(5).max(32),
        name: z.string().max(200).optional(),
      })
      .default({ phone: "" }),
    message: z.object({
      id: z.string().min(1).max(200),
      type: z.string().min(1).max(32),
      text: z
        .object({ body: z.string().max(10000).optional() })
        .optional()
        .default({}),
      timestamp: z.string().optional(),
    }),
    businessPhoneNumberId: z.string().max(64).optional(),
    workflowId: z.string().max(200).optional(),
    executionId: z.string().max(200).optional(),
  })
  .strict();

export type WhatsappIngestPayload = z.infer<typeof whatsappMessageSchema>;

export interface IngestOutcome {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
  conversationCreated: boolean;
  analysis: {
    status: string;
    riskLevel: string;
    score: number | null;
    summary: string | null;
    analysisResultId?: string;
  } | null;
  fallbackReply: string | null;
}

const FALLBACK_REPLY =
  "Thanks for your message. This message type isn't supported for automatic analysis yet. If it contains a suspicious link or text, please forward the text here, or visit the NEXUS portal to submit it.";

export async function ingestWhatsappMessage(
  rawPayload: unknown,
  meta: { workflowId?: string; executionId?: string; ipHash?: string }
): Promise<IngestOutcome> {
  const payload = whatsappMessageSchema.parse(rawPayload);
  const senderPhone = payload.from.phone.replace(/[^\d]/g, "");
  const messageId = payload.message.id;

  // --- Idempotency: a platform message ID is processed at most once. ---
  const existing = await prisma.message.findUnique({
    where: { platformMessageId: messageId },
    select: { id: true, conversationId: true },
  });

  if (existing) {
    const prior = await prisma.analysisResult.findFirst({
      where: { conversationId: existing.conversationId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    await logAudit({
      actorType: "AUTOMATION",
      actorId: meta.workflowId,
      action: "whatsapp.ingest.duplicate",
      targetType: "conversation",
      targetId: existing.conversationId,
      metadata: { platformMessageId: messageId },
      ipHash: meta.ipHash,
    });
    return {
      conversationId: existing.conversationId,
      messageId: existing.id,
      duplicate: true,
      conversationCreated: false,
      analysis: prior
        ? {
            status: prior.status,
            riskLevel: prior.riskLevel,
            score: prior.score,
            summary: prior.summary,
            analysisResultId: prior.id,
          }
        : null,
      fallbackReply: null,
    };
  }

  // --- Find or create the sender's active WhatsApp conversation. ---
  let conversation = await prisma.conversation.findFirst({
    where: {
      source: ConversationSource.WHATSAPP,
      externalSenderId: senderPhone,
      status: ConversationStatus.ACTIVE,
    },
    orderBy: { createdAt: "desc" },
  });

  let conversationCreated = false;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        source: ConversationSource.WHATSAPP,
        externalSenderId: senderPhone,
        title: titleFromMessage(payload.message.text?.body ?? "WhatsApp message"),
        status: ConversationStatus.ACTIVE,
      },
    });
    conversationCreated = true;
  }

  // --- Phone-based linking: bind the conversation to a verified user. ---
  if (!conversation.userId) {
    const usersWithPhone = await prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    const linkedUser = usersWithPhone.find((u) =>
      u.phone ? phonesMatch(u.phone, senderPhone) : false
    );
    if (linkedUser) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { userId: linkedUser.id },
      });
      await logAudit({
        actorType: "AUTOMATION",
        actorId: meta.workflowId,
        action: "whatsapp.conversation.linked",
        targetType: "conversation",
        targetId: conversation.id,
        metadata: { userId: linkedUser.id },
        ipHash: meta.ipHash,
      });
    }
  }

  const body = payload.message.text?.body ?? "";
  const isText = payload.message.type === "text" && body.length > 0;

  // --- Store the inbound message. ---
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sender: MessageSender.USER,
      type: isText ? MessageType.TEXT : MessageType.FILE,
      content: isText ? body : `[Unsupported message type: ${payload.message.type}]`,
      platformMessageId: messageId,
      metadata: {
        provider: "whatsapp",
        messageType: payload.message.type,
        senderName: payload.from.name ?? null,
        timestamp: payload.message.timestamp ?? null,
        businessPhoneNumberId: payload.businessPhoneNumberId ?? null,
      },
    },
  });

  // --- Store extracted URLs for the text message. ---
  if (isText) {
    const urls = extractUrls(body);
    if (urls.length > 0) {
      await prisma.extractedUrl.createMany({
        data: urls.map((u) => ({
          conversationId: conversation.id,
          rawUrl: u.rawUrl,
          normalizedUrl: u.normalizedUrl,
          normalizedHash: u.normalizedHash,
          host: u.host,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Non-text messages cannot be analyzed; route them to a safe fallback.
  if (!isText) {
    await logAudit({
      actorType: "AUTOMATION",
      actorId: meta.workflowId,
      action: "whatsapp.ingest.unsupported",
      targetType: "conversation",
      targetId: conversation.id,
      metadata: { messageType: payload.message.type, platformMessageId: messageId },
      ipHash: meta.ipHash,
    });
    return {
      conversationId: conversation.id,
      messageId: message.id,
      duplicate: false,
      conversationCreated,
      analysis: null,
      fallbackReply: FALLBACK_REPLY,
    };
  }

  // --- Run the deterministic pipeline (DeepSeek explanation arrives via
  //     POST /api/n8n/analysis-result after n8n calls the AI model). ---
  const result = await runAnalysisPipeline({
    conversationId: conversation.id,
    idempotencyKey: `wa:${messageId}`,
    workflowId: meta.workflowId ?? payload.workflowId,
    executionId: meta.executionId ?? payload.executionId,
    messageContent: body,
  });

  await logAudit({
    actorType: "AUTOMATION",
    actorId: meta.workflowId,
    action: "whatsapp.ingest.processed",
    targetType: "conversation",
    targetId: conversation.id,
    metadata: {
      platformMessageId: messageId,
      riskLevel: result.riskLevel,
      score: result.score,
      analysisResultId: result.id,
    },
    ipHash: meta.ipHash,
  });

  return {
    conversationId: conversation.id,
    messageId: message.id,
    duplicate: false,
    conversationCreated,
    analysis: {
      status: result.status,
      riskLevel: result.riskLevel,
      score: result.score,
      summary: result.summary,
      analysisResultId: result.id,
    },
    fallbackReply: null,
  };
}

export type { AnalysisStatus };
