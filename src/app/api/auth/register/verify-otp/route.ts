import { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";
import {
  databaseSchemaMissingMessage,
  databaseUnavailableMessage,
  isDatabaseSchemaMissing,
  isDatabaseUnavailable,
} from "@/lib/db-errors";
import { hashOtp, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { authRateLimiter, clientIp, rateLimitKey } from "@/lib/rate-limiter";
import { hashIp, logAudit } from "@/lib/audit";

const verifyOtpSchema = z.object({
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
});

export async function POST(request: Request) {
  try {
    const body = verifyOtpSchema.parse(await request.json());

    const limit = authRateLimiter.check(rateLimitKey(request, `verify:${body.email}`));
    if (!limit.ok) {
      return jsonError("Too many attempts. Try again later.", 429);
    }

    const pending = await prisma.registrationOtp.findUnique({
      where: { email: body.email },
    });

    if (!pending) {
      return jsonError("Verification code not found. Request a new code.", 404);
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await prisma.registrationOtp.delete({ where: { email: body.email } });
      return jsonError("Verification code expired. Request a new code.", 410);
    }

    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.registrationOtp.delete({ where: { email: body.email } });
      return jsonError("Too many invalid attempts. Request a new code.", 429);
    }

    if (pending.otpHash !== hashOtp(body.otp)) {
      await prisma.registrationOtp.update({
        where: { email: body.email },
        data: { attempts: { increment: 1 } },
      });
      return jsonError("Invalid verification code", 401);
    }

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: pending.name,
          email: pending.email,
          phone: pending.phone,
          passwordHash: pending.passwordHash,
          emailVerifiedAt: new Date(),
        },
        select: { id: true, name: true, email: true, phone: true },
      });

      await tx.registrationOtp.delete({
        where: { email: body.email },
      });

      return createdUser;
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
