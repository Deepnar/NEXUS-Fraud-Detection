import { jsonError, jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/officer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/officer/audit-log — security audit trail (admin only). */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Forbidden", 403);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50")));
  const action = url.searchParams.get("action")?.trim();

  const where = action ? { action: { contains: action } } : {};

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return jsonOk({ logs, total, page, pageSize });
}
