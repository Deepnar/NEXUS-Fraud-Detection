/**
 * Seed/update an officer account. Officers are provisioned by an admin or
 * operator — there is intentionally no public officer registration.
 *
 * Usage:
 *   OFFICER_EMAIL=officer@nexus.local OFFICER_PASSWORD='...' \
 *   OFFICER_NAME="Aarav Sharma" OFFICER_ROLE=ADMIN npm run seed:officer
 *
 * Defaults (dev only): officer@nexus.local / Officer@12345
 */
import bcrypt from "bcryptjs";
import { PrismaClient, OfficerRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.OFFICER_EMAIL ?? "officer@nexus.local").toLowerCase().trim();
  const password = process.env.OFFICER_PASSWORD ?? "Officer@12345";
  const name = process.env.OFFICER_NAME ?? "NEXUS Officer";
  const role = (process.env.OFFICER_ROLE ?? "OFFICER").toUpperCase() === "ADMIN" ? OfficerRole.ADMIN : OfficerRole.OFFICER;

  if (password.length < 8) {
    throw new Error("OFFICER_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const officer = await prisma.officer.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { email, name, passwordHash, role },
  });

  console.log(`Officer ready: ${officer.email} (${officer.role}) — id ${officer.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
