import { createMemoryDb, type MemoryDb } from "../memdb";

/** One store per page; replaces src/server/db.ts (Prisma + PostgreSQL) in the single-file build. */
const g = globalThis as unknown as { __uceMemDb?: MemoryDb };
export const memdb: MemoryDb = (g.__uceMemDb ??= createMemoryDb());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = memdb.client;
