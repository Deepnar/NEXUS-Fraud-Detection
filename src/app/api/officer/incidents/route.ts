import { z } from "zod";
import { IncidentStatus, RiskLevel } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const queueFilters = z.object({
  status: z
    .enum(["PENDING", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE", "ALL"])
    .default("PENDING"),
  risk: z.nativeEnum(RiskLevel).optional(),
  source: z.enum(["WEB"]).optional(),
  kind: z.enum(["MESSAGE", "TRANSACTION"]).optional(),
  assignee: z
    .enum(["me", "unassigned"])
    .or(z.string().min(1).max(64))
    .optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const parsed = queueFilters.parse(Object.fromEntries(url.searchParams));
  const where: Record<string, unknown> = {};

  if (parsed.status !== "ALL") {
    where.status = parsed.status as IncidentStatus;
  }
  if (parsed.risk) {
    where.analysisResults = { some: { riskLevel: parsed.risk } };
  }
  if (parsed.source) {
    where.conversation = { source: parsed.source };
  }
  if (parsed.kind === "MESSAGE") {
    where.conversationId = { not: null };
  } else if (parsed.kind === "TRANSACTION") {
    where.transactionCheckId = { not: null };
  }
  if (parsed.assignee) {
    if (parsed.assignee === "me") {
      where.assignments = { some: { officerId: officer.id } };
    } else if (parsed.assignee === "unassigned") {
      where.assignments = { none: {} };
    } else {
      where.assignments = { some: { officerId: parsed.assignee } };
    }
  }
  if (parsed.q) {
    where.OR = [
      { reason: { contains: parsed.q } },
      { conversation: { title: { contains: parsed.q } } },
      { id: { contains: parsed.q } },
    ];
  }

  const [incidents, total] = await Promise.all([
    prisma.incidentReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize,
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            source: true,
            status: true,
            externalSenderId: true,
            updatedAt: true,
            analysisResults: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, riskLevel: true, score: true, status: true },
            },
          },
        },
        transactionCheck: {
          select: {
            id: true,
            amount: true,
            currency: true,
            txnType: true,
            receiverName: true,
            merchant: true,
            receiverRef: true,
            riskLevel: true,
            score: true,
            status: true,
            updatedAt: true,
          },
        },
        user: { select: { id: true, name: true, phone: true } },
        assignments: {
          include: { officer: { select: { id: true, name: true } } },
          take: 1,
        },
        _count: { select: { notes: true } },
      },
    }),
    prisma.incidentReport.count({ where }),
  ]);

  return jsonOk({
    incidents,
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });
}
