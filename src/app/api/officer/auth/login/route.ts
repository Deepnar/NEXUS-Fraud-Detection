import { z } from "zod";
import bcrypt from "bcryptjs";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { createOfficerSession } from "@/lib/officer";
import { authRateLimiter, clientIp, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("A valid email is required").max(254),
  password: z.string().min(1, "Password is required").max(200),
});

export async function POST(request: Request) {
  const limit = authRateLimiter.check(rateLimitKey(request, "officer-login"));
  if (!limit.ok) {
    return jsonError("Too many attempts. Try again later.", 429);
  }

  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch (error) {
    return jsonError(parseJsonError(error), 400);
  }

  const officer = await prisma.officer.findUnique({
    where: { email: body.email.toLowerCase().trim() },
  });

  // Same error for unknown email vs wrong password to avoid user enumeration.
  const passwordOk =
    officer && (await bcrypt.compare(body.password, officer.passwordHash));

  if (!officer || !passwordOk) {
    await logAudit({
      actorType: "SYSTEM",
      action: "officer.login.failed",
      targetType: "officer",
      targetId: officer?.id ?? null,
      metadata: { email: body.email.toLowerCase().trim() },
      ipHash: hashIp(clientIp(request)),
    });
    return jsonError("Invalid email or password", 401);
  }

  await createOfficerSession(
    { id: officer.id, email: officer.email, role: officer.role },
    {
      device: request.headers.get("user-agent") ?? undefined,
      ipHash: hashIp(clientIp(request)),
    }
  );

  await logAudit({
    actorType: "OFFICER",
    actorId: officer.id,
    action: "officer.login.success",
    targetType: "officer",
    targetId: officer.id,
    ipHash: hashIp(clientIp(request)),
  });

  return jsonOk({
    officer: {
      id: officer.id,
      name: officer.name,
      email: officer.email,
      role: officer.role,
    },
  });
}
