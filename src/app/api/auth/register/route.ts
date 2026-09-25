import { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { authRateLimiter, clientIp, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";
import {
  databaseSchemaMissingMessage,
  databaseUnavailableMessage,
  isDatabaseSchemaMissing,
  isDatabaseUnavailable,
} from "@/lib/db-errors";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  phone: z.string().trim().min(8).max(24).optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());

    const limit = await authRateLimiter.check(rateLimitKey(request, `register:${body.email}`));
    if (!limit.ok) {
      return jsonError("Too many attempts. Try again later.", 429);
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.email }, ...(body.phone ? [{ phone: body.phone }] : [])],
      },
      select: { id: true },
    });

    if (existingUser) {
      return jsonError("An account already exists with this email or phone", 409);
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        passwordHash: await hashPassword(body.password),
        emailVerifiedAt: new Date(),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    const token = await createSession({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    await logAudit({
      actorType: "USER",
      actorId: user.id,
      action: "user.register.completed",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email },
      ipHash: hashIp(clientIp(request)),
    });

    return jsonOk({ user }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return jsonError(databaseUnavailableMessage(), 503);
    }

    if (isDatabaseSchemaMissing(error)) {
      return jsonError(databaseSchemaMissingMessage(), 503);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("An account already exists with this email or phone", 409);
    }

    return jsonError(parseJsonError(error), 400);
  }
}
