import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";
import {
  databaseSchemaMissingMessage,
  databaseUnavailableMessage,
  isDatabaseSchemaMissing,
  isDatabaseUnavailable,
} from "@/lib/db-errors";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { authRateLimiter, clientIp, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const limit = await authRateLimiter.check(rateLimitKey(request, `login:${body.email}`));
    if (!limit.ok) {
      return jsonError("Too many attempts. Try again later.", 429);
    }

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      await logAudit({
        actorType: "SYSTEM",
        action: "user.login.failed",
        targetType: "user",
        targetId: user?.id ?? null,
        metadata: { email: body.email },
        ipHash: hashIp(clientIp(request)),
      });
      return jsonError("Invalid email or password", 401);
    }

    const token = await createSession({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    await logAudit({
      actorType: "USER",
      actorId: user.id,
      action: "user.login.success",
      targetType: "user",
      targetId: user.id,
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
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
