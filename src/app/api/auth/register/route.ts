import { z } from "zod";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createOtp, hashOtp, otpExpiryDate } from "@/lib/otp";
import { sendRegistrationOtpEmail } from "@/lib/mailer";
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
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.email }, ...(body.phone ? [{ phone: body.phone }] : [])],
      },
      select: { id: true },
    });

    if (existingUser) {
      return jsonError("An account already exists with this email or phone", 409);
    }

    const otp = createOtp();
    await prisma.registrationOtp.upsert({
      where: { email: body.email },
      create: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        passwordHash: await hashPassword(body.password),
        otpHash: hashOtp(otp),
        expiresAt: otpExpiryDate(),
      },
      update: {
        name: body.name,
        phone: body.phone || null,
        passwordHash: await hashPassword(body.password),
        otpHash: hashOtp(otp),
        attempts: 0,
        expiresAt: otpExpiryDate(),
      },
    });

    await sendRegistrationOtpEmail({
      to: body.email,
      name: body.name,
      otp,
    });

    return jsonOk({ ok: true, message: "Verification code sent" });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return jsonError(databaseUnavailableMessage(), 503);
    }

    if (isDatabaseSchemaMissing(error)) {
      return jsonError(databaseSchemaMissingMessage(), 503);
    }

    if (error instanceof Error && error.message.startsWith("SMTP is not configured")) {
      return jsonError(error.message, 503);
    }

    return jsonError(parseJsonError(error), 400);
  }
}
