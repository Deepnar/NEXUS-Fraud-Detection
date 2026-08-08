import { jsonError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  return jsonOk({ user });
}
