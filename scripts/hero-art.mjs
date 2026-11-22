// Turns the source artwork into what the homepage loads, and works out the
// second mask that lets characters rise out of the top of the splash.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import config from "./hero-art.config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/hero");
const src = (p) => resolve(root, p);
sharp.concurrency(2);
const open = (p) => sharp(src(p), { limitInputPixels: false, density: 300 });

// Slides listed in the config, then every complete folder in hero-art/.
const found = [...config.slides];
const art = src(config.folder);
if (existsSync(art)) {
  for (const dir of readdirSync(art, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const files = readdirSync(join(art, dir));
    const pick = (kind) => files.find((f) => new RegExp(`^${kind}\\.(png|jpe?g|webp|avif)$`, "i").test(f));
    const [background, character] = [pick("background"), pick("character")];
    if (!background || !character) { console.warn(`Skipped ${dir}: it needs both a background and a character image.`); continue; }
    const id = dir.replace(/^\d+[-_. ]*/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || found.some((s) => s.id === id)) throw new Error(`Give ${dir} a name no other slide uses.`);
    found.push({ id, background: join(config.folder, dir, background), character: join(config.folder, dir, character) });
  }
}

const MASK = 1600; // px wide: sharp on a 2x screen at the size it is shown
const SIZES = { background: [760, 1360], character: [640, 1200] };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- the masks
const meta = await open(config.splash).metadata();
const W = MASK;
const H = Math.round((W * meta.height) / meta.width);
const head = Math.round(H * config.headroom);
const full = H + head;
const alpha = await open(config.splash).resize(W, H).ensureAlpha().extractChannel(3).raw().toBuffer();

// The body of the splash: its largest connected patch, so specks are ignored.
const label = new Int32Array(W * H);
let best = { size: 0, id: 0 };
let id = 0;
const stack = new Int32Array(W * H);
for (let i = 0; i < W * H; i++) {
  if (alpha[i] < 128 || label[i]) continue;
  id++;
  let top = 0, size = 0;
  stack[top++] = i;
  label[i] = id;
  while (top) {
    const p = stack[--top];
    size++;
    const x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (q >= 0 && q < W * H && alpha[q] >= 128 && !label[q]) { label[q] = id; stack[top++] = q; }
    }
  }
  if (size > best.size) best = { size, id };
}

// In each column, open everything above the middle of the first solid stretch.
// Going to the middle, not the edge, means the bristles along the top do not
// cut slits in a character that crosses them. Below that, the splash rules.
const solid = Math.round(H * 0.07);
const slit = Math.round(H * 0.08); // a gap this thin is a mark in the paint, not an edge
const deepest = Math.round(H * 0.42); // never open the lower half, whatever the shape
const line = new Int32Array(W).fill(-1);
for (let x = 0; x < W; x++) {
  let start = -1, end = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && label[y * W + x] === best.id;
    if (on) { if (start < 0) start = y; end = y; }
    else if (start >= 0 && (y - end > slit || y === H)) {
      if (end - start >= solid) { line[x] = Math.min(deepest, Math.round((start + end) / 2)); break; }
      start = -1;
    }
  }
}
const [from, to] = config.rise.map((f) => f * W);
const columns = [...line.keys()].filter((x) => line[x] >= 0 && x >= from && x <= to);
const [left, right] = [columns[0], columns.at(-1)];
for (let x = left, last = line[left]; x <= right; x++) { if (line[x] < 0) line[x] = last; else last = line[x]; }

const inside = Buffer.alloc(W * full);
const rising = Buffer.alloc(W * full);
for (let y = 0; y < H; y++) alpha.copy(inside, (y + head) * W, y * W, (y + 1) * W);
for (let y = 0; y < full; y++) {
  for (let x = 0; x < W; x++) rising[y * W + x] = x >= left && x <= right && y - head < line[x] ? 255 : inside[y * W + x];
}
const saveMask = (data, name) =>
  sharp({ create: { width: W, height: full, channels: 3, background: "#000" } })
    .joinChannel(data, { raw: { width: W, height: full, channels: 1 } })
    .webp({ quality: 60, alphaQuality: 90, effort: 6 }).toFile(join(out, name));
await saveMask(inside, "mask-inside.webp");
await saveMask(rising, "mask-rising.webp");

// ------------------------------------------------------------ the brushstroke
// Slid across a new background to paint it on: solid, then a bristly edge, then
// nothing. The bristles run along the splash's own stroke.
{
  const [bw, bh] = [2400, 800];
  const angle = (config.stroke * Math.PI) / 180;
  const aspect = (W * 3) / full / (bw / bh); // it is stretched to three times the width
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wave = (n) => { const v = Array.from({ length: n + 2 }, random); return (t) => { const p = t * n, i = Math.floor(p), f = p - i, s = f * f * (3 - 2 * f); return v[i] * (1 - s) + v[i + 1] * s; }; };
  const [slow, mid, fine, hair] = [wave(5), wave(19), wave(80), wave(260)];
  const data = Buffer.alloc(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const px = x * aspect;
      const across = (-px * Math.sin(angle) + y * Math.cos(angle)) / bh; // which bristle
      const t = Math.min(0.9999, Math.max(0, (across + 0.6) / 4));
      const reach = 0.5 + (slow(t) - 0.5) * 0.07 + (mid(t) - 0.5) * 0.06 + (fine(t) - 0.5) * 0.05 + (hair(t) - 0.5) * 0.05;
      const edge = (x / bw) + Math.tan(angle) * ((y / bh) - 0.5) * 0.12;
      const dry = 0.002 + fine(t) ** 3 * 0.022; // some bristles run drier than others
      data[y * bw + x] = Math.round(255 * Math.min(1, Math.max(0, (reach - edge) / dry)));
    }
  }
  await sharp({ create: { width: bw, height: bh, channels: 3, background: "#000" } })
    .joinChannel(data, { raw: { width: bw, height: bh, channels: 1 } })
    .webp({ quality: 50, alphaQuality: 80, effort: 6 }).toFile(join(out, "brush.webp"));
}

// --------------------------------------------------------------- the artwork
const slides = [];
const widths = (wanted, available) => [...new Set(wanted.map((w) => Math.min(w, available)))];
for (const s of found) {
  const bg = await open(s.background).metadata();
  const stage = W / full;
  const crop = bg.width / bg.height > stage
    ? { width: Math.round(bg.height * stage), height: bg.height }
    : { width: bg.width, height: Math.round(bg.width / stage) };
  const at = (size, room, f) => Math.max(0, Math.min(room - size, Math.round(room * f - size / 2)));
  const area = { ...crop, left: at(crop.width, bg.width, s.focus?.[0] ?? 0.5), top: at(crop.height, bg.height, s.focus?.[1] ?? 0.5) };
  const bgWidths = widths(SIZES.background, area.width);
  for (const w of bgWidths) {
    const base = open(s.background).extract(area).resize({ width: w }).removeAlpha();
    await base.clone().avif({ quality: 46, effort: 6 }).toFile(join(out, `${s.id}-background-${w}.avif`));
    await base.clone().webp({ quality: 66, effort: 6 }).toFile(join(out, `${s.id}-background-${w}.webp`));
  }
  const ch = await open(s.character).metadata();
  if (!ch.hasAlpha) throw new Error(`${s.character} has no transparency, so there is nothing to cut out.`);
  const chWidths = widths(SIZES.character, ch.width);
  for (const w of chWidths) {
    const base = open(s.character).resize({ width: w });
    await base.clone().avif({ quality: 56, effort: 6 }).toFile(join(out, `${s.id}-character-${w}.avif`));
    await base.clone().webp({ quality: 78, alphaQuality: 90, effort: 6 }).toFile(join(out, `${s.id}-character-${w}.webp`));
  }
  slides.push({ id: s.id, background: bgWidths, character: chWidths, characterRatio: Number((ch.width / ch.height).toFixed(4)) });
  console.log(`Slide: ${s.id}`);
}
writeFileSync(join(root, "src/lib/hero.generated.json"), JSON.stringify({
  stageRatio: Number((W / full).toFixed(4)), headroom: Number((head / full).toFixed(4)), rise: config.rise, slides,
}, null, 2) + "\n");

for (const f of readdirSync(out)) console.log(f.padEnd(34), `${Math.round(statSync(join(out, f)).size / 1024)} KB`);
