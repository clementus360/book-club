// TEST ONLY. Speaks enough of Supabase's HTTP API (Auth and PostgREST) for the
// end-to-end tests to run without Docker. Queries run as the real database
// roles with real JWT claims, so RLS, grants and functions are all genuinely
// exercised; only the HTTP layer is a stand-in. It is not secure and must never
// be used to serve people. Against a real project, set E2E_BASE_URL instead.
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";

const SECRET = "emulator-only-secret-emulator-only-secret";
const b64 = (v) => Buffer.from(v).toString("base64url");
export function signJwt(claims, secret = SECRET) {
  const body = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(claims))}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function readJwt(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!s) return null;
  const good = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (s !== good) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims;
}
const far = 4102444800;
export const anonKey = signJwt({ role: "anon", iss: "emulator", exp: far });
export const serviceKey = signJwt({ role: "service_role", iss: "emulator", exp: far });

const hash = (pw, salt = randomBytes(8).toString("hex")) => `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
const matches = (pw, stored) => {
  const [salt, h] = stored.split(":");
  return timingSafeEqual(Buffer.from(hash(pw, salt).split(":")[1]), Buffer.from(h));
};
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: "PGRST100" });
  return `"${s}"`;
};

export async function startEmulator({ databaseUrl, port, stub }) {
  pg.types.setTypeParser(1114, (v) => v);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
  pool.on("error", () => {});
  const fks = new Map();
  for (const r of (await pool.query(`select c.conname, c.conrelid::regclass::text tbl, c.confrelid::regclass::text ref,
      (select array_agg(a.attname::text order by k.o) from unnest(c.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n) cols,
      (select array_agg(a.attname::text order by k.o) from unnest(c.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n) refs
      from pg_constraint c where contype='f'`)).rows) fks.set(r.conname, r);
  const fns = new Map();
  for (const r of (await pool.query(`select proname, proretset, proargnames, proargmodes::text[] modes, prorettype::regtype::text ret,
      array(select format_type(o, null) from unnest(proargtypes::oid[]) o) types from pg_proc where pronamespace='public'::regnamespace`)).rows) fns.set(r.proname, r);

  const sessions = new Map(); // refresh token -> user id
  const codes = new Map(); // pkce code -> { user, challenge }
  const links = new Map(); // one-time email token -> { user, challenge, type }
  const mail = [];
  let googleSays = {};

  async function asRole(claims, fn) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${ident(claims.role)}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------- PostgREST
  function splitTop(s) {
    const out = []; let depth = 0, cur = "";
    for (const ch of s) {
      if (ch === "(") depth++; if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out.map((x) => x.trim());
  }
  function columns(select, alias) {
    return splitTop(select || "*").map((part) => {
      if (part === "*") return `${alias}.*`;
      const m = part.match(/^(?:(\w+):)?(\w+)!(\w+)\(([\s\S]*)\)$/);
      if (!m) return `${alias}.${ident(part)}`;
      const [, name, table, fkName, inner] = m;
      const fk = fks.get(fkName);
      if (!fk || fk.ref.replace("public.", "") !== table) throw Object.assign(new Error(`no relationship ${fkName}`), { code: "PGRST200" });
      const a = `x${Math.random().toString(36).slice(2, 8)}`;
      const on = fk.cols.map((c, i) => `${a}.${ident(fk.refs[i])} = ${alias}.${ident(c)}`).join(" and ");
      return `(select row_to_json(j) from (select ${columns(inner, a)} from public.${ident(table)} ${a} where ${on}) j) as ${ident(name ?? table)}`;
    }).join(", ");
  }
  function filters(params, alias, values) {
    const out = [];
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
      let v = raw, not = "";
      if (v.startsWith("not.")) { not = "not "; v = v.slice(4); }
      const op = v.slice(0, v.indexOf(".")), arg = v.slice(v.indexOf(".") + 1);
      const col = `${alias}.${ident(key)}`;
      if (op === "is") out.push(`${col} is ${not}${["null", "true", "false"].includes(arg) ? arg : "null"}`);
      else if (op === "in") { values.push(arg.slice(1, -1).split(",").map((x) => x.replace(/^"|"$/g, ""))); out.push(`${not}(${col}::text = any($${values.length}::text[]))`); }
      else {
        const sql = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" }[op];
        if (!sql) throw Object.assign(new Error(`operator ${op}`), { code: "PGRST100" });
        values.push(arg);
        out.push(`${not}(${col} ${sql} $${values.length})`);
      }
    }
    return out.length ? ` where ${out.join(" and ")}` : "";
  }
  function tail(params, alias) {
    let sql = "";
    if (params.get("order")) sql += ` order by ${params.get("order").split(",").map((o) => { const [c, dir] = o.split("."); return `${alias}.${ident(c)} ${dir === "desc" ? "desc nulls first" : "asc nulls last"}`; }).join(", ")}`;
    if (params.get("limit")) sql += ` limit ${Number(params.get("limit"))}`;
    return sql;
  }

  async function rest(req, res, url, body, claims) {
    const path = url.pathname.slice("/rest/v1/".length);
    const params = url.searchParams;
    const prefer = req.headers.prefer ?? "";
    const object = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(data === undefined || req.method === "HEAD" ? undefined : JSON.stringify(data));
    };
    const finish = (rows, status = 200) => {
      if (!object) return send(status, rows);
      if (rows.length !== 1) return send(406, { code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: `The result contains ${rows.length} rows`, hint: null });
      return send(status, rows[0]);
    };

    if (path.startsWith("rpc/")) {
      const fn = fns.get(path.slice(4));
      if (!fn) return send(404, { code: "PGRST202", message: "function not found" });
      const names = (fn.proargnames ?? []).filter((_, i) => !fn.modes || fn.modes[i] === "i");
      const values = [];
      const args = Object.entries(body ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => {
        const type = fn.types[names.indexOf(k)];
        if (!type) throw Object.assign(new Error(`no argument ${k}`), { code: "PGRST202" });
        values.push(type === "jsonb" ? JSON.stringify(v) : v);
        return `${ident(k)} => $${values.length}::${type}`;
      });
      const call = `public.${ident(fn.proname)}(${args.join(", ")})`;
      const isSet = fn.proretset;
      const rows = await asRole(claims, async (c) => (await c.query(isSet ? `select row_to_json(t) v from ${call} t` : `select to_json(${call}) v`, values)).rows);
      if (fn.ret === "void") return send(204);
      return isSet ? finish(rows.map((r) => r.v)) : send(200, rows[0].v);
    }

    const table = `public.${ident(path)}`;
    const values = [];
    if (req.method === "GET" || req.method === "HEAD") {
      const where = filters(params, "t", values);
      const { rows, count } = await asRole(claims, async (c) => ({
        rows: req.method === "HEAD" ? [] : (await c.query(`select row_to_json(q) v from (select ${columns(params.get("select"), "t")} from ${table} t${where}${tail(params, "t")}) q`, values)).rows.map((r) => r.v),
        count: prefer.includes("count=exact") ? Number((await c.query(`select count(*) n from ${table} t${where}`, values)).rows[0].n) : null,
      }));
      if (count !== null) return send(200, rows, { "content-range": `${count ? `0-${Math.max(count - 1, 0)}` : "*"}/${count}` });
      return finish(rows);
    }
    const returning = prefer.includes("return=representation") ? ` returning ${columns(params.get("select"), "t")}` : "";
    if (req.method === "POST") {
      const list = Array.isArray(body) ? body : [body];
      const cols = Object.keys(list[0]);
      const sets = list.map((row) => `(${cols.map((c) => { values.push(row[c]); return `$${values.length}`; }).join(", ")})`);
      let conflict = "";
      // As PostgREST does: every column sent is set, conflict columns included.
      if (prefer.includes("resolution=merge-duplicates")) conflict = ` on conflict (${params.get("on_conflict").split(",").map(ident).join(", ")}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
      const rows = await asRole(claims, async (c) => (await c.query(`insert into ${table} as t (${cols.map(ident).join(", ")}) values ${sets.join(", ")}${conflict}${returning}`, values)).rows);
      return returning ? finish(rows, 201) : send(201);
    }
    if (req.method === "PATCH") {
      const sets = Object.entries(body).map(([k, v]) => { values.push(v); return `${ident(k)} = $${values.length}`; });
      const rows = await asRole(claims, async (c) => (await c.query(`update ${table} t set ${sets.join(", ")}${filters(params, "t", values)}${returning}`, values)).rows);
      return returning ? finish(rows) : send(204);
    }
    if (req.method === "DELETE") {
      const rows = await asRole(claims, async (c) => (await c.query(`delete from ${table} t${filters(params, "t", values)}${returning}`, values)).rows);
      return returning ? finish(rows) : send(204);
    }
    send(405, {});
  }

  // ------------------------------------------------------------------ Auth
  const publicUser = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, user_metadata: u.raw_user_meta_data, app_metadata: {}, created_at: u.created_at, identities: [] });
  function session(u) {
    const refresh = randomBytes(12).toString("hex");
    sessions.set(refresh, u.id);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access_token = signJwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, session_id: randomUUID(), iat: exp - 3600, exp });
    return { access_token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(u) };
  }
  const byEmail = async (e) => (await pool.query("select * from auth.users where email = $1", [String(e).toLowerCase()])).rows[0];
  const byId = async (i) => (await pool.query("select * from auth.users where id = $1", [i])).rows[0];

  async function auth(req, res, url, body, claims) {
    const send = (status, data) => { res.writeHead(status, { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" }); res.end(JSON.stringify(data ?? {})); };
    const fail = (status, code, message) => send(status, { code, message, error_code: code, msg: message });
    const route = url.pathname.slice("/auth/v1".length);
    if (route === "/signup") {
      if (await byEmail(body.email)) return fail(422, "user_already_exists", "User already registered");
      if ((body.password ?? "").length < 8) return fail(422, "weak_password", "weak");
      const { rows } = await pool.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *", [body.email.toLowerCase(), hash(body.password), JSON.stringify(body.data ?? {})]);
      return send(200, session(rows[0]));
    }
    if (route === "/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = await byEmail(body.email);
        return u && matches(body.password, u.encrypted_password) ? send(200, session(u)) : fail(400, "invalid_credentials", "Invalid login credentials");
      }
      if (grant === "refresh_token") {
        const u = sessions.has(body.refresh_token) && (await byId(sessions.get(body.refresh_token)));
        return u ? send(200, session(u)) : fail(400, "refresh_token_not_found", "Invalid Refresh Token");
      }
      if (grant === "pkce") {
        const c = codes.get(body.auth_code);
        codes.delete(body.auth_code);
        if (!c || createHash("sha256").update(body.code_verifier).digest("base64url") !== c.challenge) return fail(400, "bad_code_verifier", "bad code");
        return send(200, session(await byId(c.user)));
      }
    }
    if (route === "/recover") {
      const u = await byEmail(body.email);
      if (u) {
        const token = randomBytes(16).toString("hex");
        links.set(token, { user: u.id, challenge: body.code_challenge });
        mail.push({ to: u.email, link: `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(url.searchParams.get("redirect_to") ?? "")}` });
      }
      return send(200, {});
    }
    if (route === "/verify" && req.method === "GET") {
      const l = links.get(url.searchParams.get("token"));
      links.delete(url.searchParams.get("token"));
      const to = new URL(url.searchParams.get("redirect_to"));
      if (l) { const code = randomUUID(); codes.set(code, l); to.searchParams.set("code", code); } else to.searchParams.set("error", "access_denied");
      res.writeHead(303, { location: to.toString() });
      return res.end();
    }
    if (route === "/authorize") {
      // Stands in for Google: says yes, unless told that the person pressed Cancel.
      const to = new URL(url.searchParams.get("redirect_to"));
      if (googleSays.cancel) { to.searchParams.set("error", "access_denied"); to.searchParams.set("error_description", "The user denied access"); }
      else {
        const u = (await byEmail(googleSays.email)) ?? (await pool.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning *", [googleSays.email, JSON.stringify({ full_name: googleSays.name, avatar_url: "https://lh3.googleusercontent.com/x" })])).rows[0];
        const code = randomUUID();
        codes.set(code, { user: u.id, challenge: url.searchParams.get("code_challenge") });
        to.searchParams.set("code", code);
      }
      res.writeHead(302, { location: to.toString() });
      return res.end();
    }
    if (route === "/logout") return send(204);
    if (route === "/user") {
      const u = claims?.sub && (await byId(claims.sub));
      if (!u) return fail(403, "bad_jwt", "invalid JWT");
      if (req.method === "PUT" && body.password) await pool.query("update auth.users set encrypted_password = $1 where id = $2", [hash(body.password), u.id]);
      return send(200, publicUser(u));
    }
    fail(404, "not_found", route);
  }

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      const raw = Buffer.concat(chunks).toString();
      const body = raw ? JSON.parse(raw) : null;
      if (url.pathname.startsWith("/stub/")) return await stub(url, res);
      if (url.pathname === "/emulator/mail") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(mail.filter((m) => m.to === url.searchParams.get("to")))); }
      if (url.pathname === "/emulator/google") { googleSays = body; res.writeHead(204); return res.end(); }
      if (url.pathname === "/emulator/delete") { await pool.query("delete from public.profiles where id = (select id from auth.users where email = $1)", [url.searchParams.get("email")]); res.writeHead(204); return res.end(); }
      if (url.pathname === "/emulator/notify") { // many old notifications, which would take hundreds of clicks
        await pool.query(`insert into public.notifications (user_id, club_id, type, created_at)
          select u.id, m.club_id, 'voting_opened', now() - make_interval(hours => i) from auth.users u
          join public.club_memberships m on m.user_id = u.id, generate_series(1, $2::int) i where u.email = $1`, [url.searchParams.get("email"), url.searchParams.get("n")]);
        res.writeHead(204); return res.end();
      }
      const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "") || req.headers.apikey;
      const claims = readJwt(token);
      if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url, body, claims);
      if (url.pathname.startsWith("/rest/v1/")) {
        if (!claims) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: "PGRST301", message: "JWT invalid" })); }
        return await rest(req, res, url, body, claims);
      }
      res.writeHead(404).end();
    } catch (e) {
      const status = e.code === "42501" ? 403 : e.code === "23505" ? 409 : /^(PGRST|[0-9A-Z]{5}$)/.test(e.code ?? "") ? 400 : 500;
      if (status === 500) console.error("[emulator]", req.method, req.url, e);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: e.code ?? "XX000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null }));
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${port}`, async stop() { server.close(); await pool.end(); } };
}
