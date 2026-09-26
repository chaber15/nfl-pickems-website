#!/usr/bin/env node
/**
 * Local dev: the website (Vite) and the API (Netlify functions) as two processes.
 *
 *   npm run dev:full            → http://localhost:5173
 *   npm run dev:full -- --host  → also reachable from a phone on the same Wi-Fi
 *
 * Why not `netlify dev`: it applies public/_redirects' SPA fallback to Vite's own module
 * requests (blank page), and without --offline it loads the site's Netlify env vars, which
 * include the PRODUCTION database. Here the functions run --offline and DATABASE_URL comes
 * only from .env (which should point at the Neon dev branch).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function readDotEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readDotEnv(".env");
if (!env?.DATABASE_URL) {
  console.error("No DATABASE_URL in .env. Copy .env.example to .env and point it at the Neon dev branch.");
  process.exit(1);
}
let dbHost = "?";
try {
  dbHost = new URL(env.DATABASE_URL).hostname;
} catch {
  console.error("DATABASE_URL in .env is not a valid URL.");
  process.exit(1);
}
console.log(`[dev] API database host: ${dbHost}  (from .env — make sure this is the dev branch)`);

const children = [];
function run(name, cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, { env: { ...process.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `[${name}] ${l}`)
      .join("\n") + "\n";
  child.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  child.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  child.on("exit", (code) => {
    console.log(`[${name}] exited (${code ?? "signal"}), stopping dev.`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// .env's DATABASE_URL wins over anything exported in the shell.
run("api", "npx", ["netlify", "functions:serve", "--offline", "--port", "9999"], { DATABASE_URL: env.DATABASE_URL });
run("web", "npx", ["vite", ...process.argv.slice(2)]);
