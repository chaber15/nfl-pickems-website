import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  db = drizzle(neon(url), { schema });
  return db;
}

/** Tests only: swap in a Drizzle instance over a fake client (`server/testDb.ts`); null resets. */
export function setDbForTests(fake: typeof db) {
  db = fake;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
