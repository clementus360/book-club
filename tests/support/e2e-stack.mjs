// Postgres + emulator + a production build of the app, for Playwright.
import { spawn } from "node:child_process";
import { createDatabase, startPostgres } from "./postgres.mjs";
import { anonKey, serviceKey, startEmulator } from "./supabase-emulator.mjs";
import { bookStub } from "./book-stub.mjs";

const API = 54399;
const APP = Number(process.env.E2E_PORT ?? 3199);
const live = process.env.E2E_LIVE_BOOKS === "1";
const server = await startPostgres();
const db = await createDatabase(server.url, "e2e");
const emulator = await startEmulator({ databaseUrl: db, port: API, stub: bookStub });
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: emulator.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SECRET_KEY: serviceKey,
  NEXT_PUBLIC_GOOGLE_AUTH: "1", NEXT_PUBLIC_SITE_URL: `http://localhost:${APP}`,
  ...(live ? {} : { OPEN_LIBRARY_URL: emulator.url + "/stub/ol", GOOGLE_BOOKS_URL: emulator.url + "/stub/gb" }),
};
let child;
function stop(code = 0) {
  child?.kill("SIGTERM");
  void emulator.stop();
  server.stop();
  process.exit(code);
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => stop(0));
const run = (args) => new Promise((resolve) => { child = spawn("npx", ["next", ...args], { env, stdio: "inherit" }); child.on("exit", (c) => resolve(c ?? 0)); });

console.log(`E2E_DATABASE_URL=${db}`);
if (process.env.E2E_DEV === "1") stop(await run(["dev", "-p", String(APP)]));
const built = await run(["build"]);
if (built !== 0) stop(built);
stop(await run(["start", "-p", String(APP)]));
