"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import type { ActionState } from "@/lib/action";
import { removePicture, uploadPicture, chooseGooglePicture } from "@/lib/actions/pictures";
import { Icon } from "./icon";
import { Avatar } from "./ui";
import { trouble } from "@/lib/trouble";

const SIDE = 256;

/** A centred square, 256 pixels across, as WebP (or JPEG where the browser cannot make WebP). */
async function shrink(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  image.close();
  const make = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await make("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await make("image/jpeg");
  if (!blob) throw new Error("could not encode");
  return blob;
}

export function PictureForm({ person, google }: { person: { display_name: string; avatar_url: string | null }; google: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [said, setSaid] = useState<ActionState | null>(null);
  const [busy, start] = useTransition();
  const shown = preview ?? person.avatar_url;

  const run = (action: () => Promise<ActionState>, local: string | null = null) => {
    setSaid(null);
    start(async () => {
      const result = await action().catch((error: unknown): ActionState => trouble(error));
      setSaid(result);
      setPreview(result.ok ? local : null);
    });
  };

  async function chosen(file: File | undefined) {
    if (!file) return;
    let blob: Blob;
    try {
      blob = await shrink(file);
    } catch {
      setSaid({ ok: false, message: "That picture could not be opened. Try a JPEG or PNG photo." });
      return;
    }
    const local = URL.createObjectURL(blob);
    setPreview(local);
    const form = new FormData();
    form.set("picture", blob, blob.type === "image/webp" ? "picture.webp" : "picture.jpg");
    run(() => uploadPicture(form), local);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="mb-6">
      <p className="label">Picture</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Avatar person={{ display_name: person.display_name, avatar_url: shown }} className="size-20 text-3xl" />
        <div className="flex flex-col items-start gap-1">
          <label className="btn-text cursor-pointer" data-hint="Pick a photo. It is cropped to a square and made small before it is saved.">
            <Icon of={ImageUp} />{busy ? "Saving…" : shown ? "Choose a different picture" : "Choose a picture"}
            <input ref={input} type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => void chosen(e.target.files?.[0])} />
          </label>
          {google && <button type="button" className="btn-text" disabled={busy} onClick={() => run(chooseGooglePicture)}>Use my Google picture</button>}
          {shown && <button type="button" className="btn-text danger" disabled={busy} onClick={() => run(removePicture)}><Icon of={Trash2} />Remove picture</button>}
        </div>
      </div>
      <p className="hint">Members of your clubs see it next to your name.</p>
      <div aria-live="polite">{said?.message && <p className={`notice mt-3 ${said.ok ? "" : "error"}`}>{said.message}</p>}</div>
    </div>
  );
}
