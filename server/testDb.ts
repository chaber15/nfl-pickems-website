/**
 * Tests only: a Drizzle neon-http instance over a fake client that records every
 * statement (and which `db.batch` it belonged to) and answers from a responder.
 * Not imported by app code.
 */
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./db/schema";
import { setDbForTests } from "./db";

export type RecordedQuery = { sql: string; params: unknown[]; batch: number | null };
/** Rows keyed by column name (converted to arrays for Drizzle), or raw arrays. */
type Row = Record<string, unknown> | unknown[];
export type Responder = (q: { sql: string; params: unknown[] }) => Row[] | undefined;

/** Column names of the top-level `select … from` or `returning …` list, in order. */
function selectedColumns(sql: string): string[] {
  const m = /\breturning\s+(.+)$/is.exec(sql) ?? /^\s*select\s+(?:distinct\s+)?(.+?)\s+from\s/is.exec(sql);
  if (!m) return [];
  return m[1].split(/,\s*/).map((item) => {
    const ids = item.match(/"([^"]+)"/g);
    return ids ? ids[ids.length - 1].slice(1, -1) : item.trim();
  });
}

export function installFakeDb(respond: Responder = () => []) {
  const queries: RecordedQuery[] = [];
  let batches = 0;

  const query = (sql: string, params: unknown[] = [], opts: { arrayMode?: boolean } = {}) => {
    queries.push({ sql, params, batch: null });
    const rows = respond({ sql, params }) ?? [];
    const cols = selectedColumns(sql);
    const out = rows.map((r) =>
      Array.isArray(r) || !opts.arrayMode ? r : cols.map((c) => (r as Record<string, unknown>)[c] ?? null),
    );
    return Promise.resolve({ rows: out, fields: [], rowCount: out.length, command: "" });
  };
  const client = Object.assign(query, {
    query,
    // `db.batch` builds every statement (recorded above) and then hands them over here.
    transaction: (pending: Promise<unknown>[]) => {
      const id = ++batches;
      for (const q of queries.slice(-pending.length)) q.batch = id;
      return Promise.all(pending);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDbForTests(drizzle(client as any, { schema }));
  return { queries, reset: () => setDbForTests(null) };
}
