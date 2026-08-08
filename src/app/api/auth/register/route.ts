import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonError, jsonOk, parseJsonError } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  phone: z.string().trim().min(8).max(24).optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    const token = await createSession({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return jsonOk({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("An account already exists with this email or phone", 409);
    }

    return jsonError(parseJsonError(error), 400);
  }
}
