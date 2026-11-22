// Starts a disposable Postgres on its own port and data directory, or uses
// TEST_DATABASE_URL (a server where databases may be created) if it is set.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));

function findBin() {
  const candidates = [process.env.PG_BIN];
  const app = "/Applications/Postgres.app/Contents/Versions";
  if (existsSync(app)) {
    for (const v of readdirSync(app).filter((d) => /^\d+$/.test(d)).sort((a, b) => b - a)) {
      candidates.push(join(app, v, "bin"));
    }
  }
  for (const base of ["/usr/lib/postgresql", "/opt/homebrew/opt"]) {
    if (existsSync(base)) for (const d of readdirSync(base)) candidates.push(join(base, d, "bin"));
  }
  const found = candidates.find((dir) => dir && existsSync(join(dir, "initdb")));
  if (!found) {
    throw new Error("No Postgres binaries found. Install Postgres 15+ and set PG_BIN, or set TEST_DATABASE_URL.");
  }
  return found;
}

export const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** @returns {Promise<{ url: string, stop: () => void }>} */
export async function startPostgres({ dataDir } = {}) {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL, stop() {} };
  const bin = findBin();
  const port = await freePort();
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), "commonplace-pg-"));
  const pgdata = join(dir, "data");
  const env = { ...process.env, LC_ALL: "C" };
  if (!existsSync(pgdata)) {
    execFileSync(join(bin, "initdb"), ["-D", pgdata, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], { stdio: "pipe", env });
  }
  execFileSync(
    join(bin, "pg_ctl"),
    ["-D", pgdata, "-l", join(dir, "log"), "-w", "-o", `-p ${port} -k '' -c listen_addresses=127.0.0.1 -c fsync=off`, "start"],
    { stdio: "ignore", env },
  );
  return {
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    stop() {
      try {
        execFileSync(join(bin, "pg_ctl"), ["-D", pgdata, "-m", "immediate", "stop"], { stdio: "ignore", env });
      } finally {
        if (!dataDir) rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Creates a fresh database with the Supabase shim and every migration applied. */
export async function createDatabase(serverUrl, name, { before } = {}) {
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  // Roles are cluster-wide, so parallel test files must not create them together.
  await admin.query("select pg_advisory_lock(4242)");
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(join(root, "tests/support/supabase-shim.sql"), "utf8"));
  await admin.query("select pg_advisory_unlock(4242)");
  await admin.end();
  if (before) await db.query(before); // state that predates the migrations
  const dir = join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.query("begin");
      await db.query(readFileSync(join(dir, file), "utf8"));
      await db.query("commit");
    } catch (error) {
      error.message = `${file}: ${error.message}${error.position ? ` (at character ${error.position})` : ""}`;
      await db.end();
      throw error;
    }
  }
  await db.end();
  return url.toString();
}
