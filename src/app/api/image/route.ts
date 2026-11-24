import { lookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicAddress } from "@/lib/net";
import { createClient } from "@/lib/supabase/server";

/**
 * Pictures members pasted in (manual covers, club images), fetched by the
 * server so the site they are on sees our server, not the people looking.
 * Only for signed-in members, only https, only public addresses on the
 * internet, only real images, and only small ones.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const TYPES = /^image\/(png|jpeg|gif|webp|avif)$/; // never SVG: it can carry script

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS that refuses private answers, used for the connection itself so a name cannot change its answer in between. */
function publicLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback) {
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const usable = addresses.filter((a) => isPublicAddress(a.address));
    if (!usable.length || usable.length !== addresses.length) {
      return callback(Object.assign(new Error("Not a public address"), { code: "EPRIVATE" }), "");
    }
    if (options.all) return callback(null, usable);
    callback(null, usable[0]!.address, usable[0]!.family);
  });
}

type Fetched = { type: string; body: Buffer } | { redirect: string } | null;

function fetchOnce(url: URL): Promise<Fetched> {
  return new Promise((resolve) => {
    const req = httpsRequest(url, {
      method: "GET",
      lookup: publicLookup as never,
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif", "user-agent": "Mozilla/5.0 (compatible; image fetch)" },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: res.headers.location });
      }
      const type = String(res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (status !== 200 || !TYPES.test(type) || Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
        res.destroy();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); resolve(null); } else chunks.push(c);
      });
      res.on("end", () => resolve({ type, body: Buffer.concat(chunks) }));
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

function parse(raw: string | null, base?: URL): URL | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(u.hostname.replace(/^\[|\]$/g, ""))) return null;
    return u;
  } catch {
    return null;
  }
}

const none = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "private, max-age=300" } });

export async function GET(request: NextRequest) {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims) return none(401);

  let url = parse(request.nextUrl.searchParams.get("u"));
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    const got = await fetchOnce(url);
    if (!got) return none(404);
    if ("redirect" in got) { url = parse(got.redirect, url); continue; }
    return new NextResponse(new Uint8Array(got.body), {
      headers: {
        "content-type": got.type,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "content-disposition": "inline",
      },
    });
  }
  return none(404);
}
