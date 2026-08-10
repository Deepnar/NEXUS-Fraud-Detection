import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  OFFICER_SESSION_COOKIE,
  OFFICER_SESSION_TTL_SECONDS,
  signOfficerToken,
  verifyOfficerToken,
} from "@/lib/officer-session-edge";

/**
 * Server-only officer session management: signing, cookie handling, and
 * DB-backed revocation. The middleware only verifies the JWT (edge-safe);
 * every API route re-validates the session against the database here.
 */

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createOfficerSession(
  officer: { id: string; email: string; role: "OFFICER" | "ADMIN" },
  meta: { device?: string; ipHash?: string } = {}
): Promise<void> {
  const token = await signOfficerToken({
    officerId: officer.id,
    email: officer.email,
    role: officer.role,
  });

  await prisma.officerSession.create({
    data: {
      officerId: officer.id,
      tokenHash: tokenHash(token),
      device: meta.device ?? null,
      ipHash: meta.ipHash ?? null,
      expiresAt: new Date(Date.now() + OFFICER_SESSION_TTL_SECONDS * 1000),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(OFFICER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OFFICER_SESSION_TTL_SECONDS,
  });
}

export async function getOfficerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OFFICER_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await verifyOfficerToken(token);
  if (!payload) {
    return null;
  }

  // Revocation check: the JWT is only a claim; the DB row is the truth.
  const session = await prisma.officerSession.findUnique({
    where: { tokenHash: tokenHash(token) },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return prisma.officer.findUnique({
    where: { id: payload.officerId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function requireOfficer() {
  return getOfficerSession();
}

export async function requireAdmin() {
  const officer = await getOfficerSession();
  return officer?.role === "ADMIN" ? officer : null;
}

export async function clearOfficerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OFFICER_SESSION_COOKIE)?.value;
  if (token) {
    try {
      await prisma.officerSession.updateMany({
        where: { tokenHash: tokenHash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Best effort; cookie removal below still ends the session.
    }
  }
  cookieStore.delete(OFFICER_SESSION_COOKIE);
}
