import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";

/** The frame for every page outside the app that does one thing. */
export function Shell({ kicker, title, lede, children, action, home = "/", wide = false }: {
  kicker?: ReactNode; title: ReactNode; lede?: ReactNode; children?: ReactNode; action?: ReactNode; home?: string; wide?: boolean;
}) {
  return (
    <div className={`mx-auto min-h-dvh px-5 py-8 sm:px-8 sm:py-14 ${wide ? "max-w-5xl" : "max-w-xl"}`}>
      <header className="mb-10 flex min-h-11 items-center justify-between gap-4"><Wordmark href={home} className="text-2xl" />{action}</header>
      <main>
        <div className="block-gap">
          {kicker && <p className="rubric mb-1.5">{kicker}</p>}
          <h1 className="page-title">{title}</h1>
          {lede && <div className="page-lede">{lede}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
