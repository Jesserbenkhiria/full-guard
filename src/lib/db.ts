import { PrismaClient } from "@prisma/client";

/** Bump when the Prisma schema changes so dev picks up a fresh client without a manual restart. */
const PRISMA_CLIENT_VERSION = "2026-08-role-requirement-fields";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientVersion?: string;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  const stale =
    !globalForPrisma.prisma ||
    globalForPrisma.prismaClientVersion !== PRISMA_CLIENT_VERSION;

  if (stale) {
    void globalForPrisma.prisma?.$disconnect();
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  }

  return globalForPrisma.prisma;
}

export const prisma = getPrismaClient();

export default prisma;
