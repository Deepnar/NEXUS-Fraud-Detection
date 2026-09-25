import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/officer";
import { logAudit } from "@/lib/audit";
import { getAiSettingsForAdmin, saveAiSettings } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

const aiSettingsSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  baseUrl: z.string().trim().url().max(512).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  apiKey: z.string().trim().max(512).optional(),
});

/** GET /api/admin/ai-settings — current explanation provider (key masked). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Forbidden", 403);
  }
  const settings = await getAiSettingsForAdmin();
  return jsonOk({ settings });
}

/** PUT /api/admin/ai-settings — swap the explanation provider/model. */
export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = aiSettingsSchema.parse(await request.json());
    await saveAiSettings(body, admin.id);
    await logAudit({
      actorType: "OFFICER",
      actorId: admin.id,
      action: "admin.ai-settings.updated",
      targetType: "system-setting",
      targetId: "ai",
      metadata: { provider: body.provider, model: body.model ?? null, keyChanged: !!body.apiKey },
    });
    const settings = await getAiSettingsForAdmin();
    return jsonOk({ settings });
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }
}
