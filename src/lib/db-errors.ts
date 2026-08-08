import { Prisma } from "@prisma/client";

export function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001")
  );
}

export function isDatabaseSchemaMissing(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export function databaseUnavailableMessage() {
  return "Database is not reachable. Start MySQL on localhost:3306 and run Prisma migrations.";
}

export function databaseSchemaMissingMessage() {
  return "Database tables are missing. Run `npx prisma migrate deploy` before using the app.";
}
