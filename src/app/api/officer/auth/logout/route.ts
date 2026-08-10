import { jsonError, jsonOk } from "@/lib/api";
import { clearOfficerSession, requireOfficer } from "@/lib/officer";
import { clientIp } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (!officer) {
    return jsonError("Unauthorized", 401);
  }

  await clearOfficerSession();

  await logAudit({
    actorType: "OFFICER",
    actorId: officer.id,
    action: "officer.logout",
    targetType: "officer",
    targetId: officer.id,
    ipHash: hashIp(clientIp(request)),
  });

  return jsonOk({ ok: true });
}
