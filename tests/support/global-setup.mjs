import { startPostgres } from "./postgres.mjs";

let server;
export async function setup(project) {
  server = await startPostgres();
  project.provide("pgUrl", server.url);
}
export async function teardown() {
  server?.stop();
}
