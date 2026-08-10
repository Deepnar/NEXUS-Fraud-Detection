import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/**
 * Edge-safe officer session helpers (jose only — no Node APIs, no Prisma).
 * Used by src/middleware.ts for route guards and by the server-side officer
 * session module for signing/verifying the officer JWT.
 */

export const OFFICER_SESSION_COOKIE = "nexus_officer_session";
export const OFFICER_SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

export type OfficerSessionPayload = {
  officerId: string;
  email: string;
  role: "OFFICER" | "ADMIN";
};

export async function signOfficerToken(
  payload: OfficerSessionPayload,
  expiresInSeconds: number = OFFICER_SESSION_TTL_SECONDS
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    // jose treats a bare number as an absolute epoch timestamp — pass a Date.
    .setExpirationTime(new Date(Date.now() + expiresInSeconds * 1000))
    .sign(encoder.encode(env.AUTH_SECRET));
}

export async function verifyOfficerToken(
  token: string
): Promise<OfficerSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.AUTH_SECRET));
    if (
      typeof payload.officerId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    if (payload.role !== "OFFICER" && payload.role !== "ADMIN") {
      return null;
    }
    return {
      officerId: payload.officerId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
