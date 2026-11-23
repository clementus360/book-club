import { BookOpen, BookPlus, Check, MessagesSquare, Vote } from "lucide-react";
import Link from "next/link";
import { Icon, Labelled } from "./icon";
import { steps, type NextStep } from "@/lib/guide";
import { words, type Kind } from "@/lib/kinds";

const GLYPHS = [BookPlus, Vote, BookOpen, MessagesSquare];

/** Where the club is: four steps, every time. */
export function Steps({ current, kind = "book" }: { current: number | null; kind?: Kind }) {
  return (
    <ol aria-label={`How ${words(kind).a} goes, step by step`} className="block-gap grid grid-cols-4 gap-x-3 sm:gap-x-5">
      {steps(kind).map((s, i) => {
        const state = current === null ? "todo" : i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={s.name} aria-current={state === "now" ? "step" : undefined}
            className={`border-t-2 pt-2 ${state === "now" ? "border-rubric" : state === "done" ? "border-leaf" : "border-rule"}`}>
            <span className={`block font-serif text-[0.9375rem] leading-tight ${state === "now" ? "sm:text-lg" : "text-soft sm:text-base"}`}><span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5"><Icon of={state === "done" ? Check : GLYPHS[i]!} className={state === "now" ? "text-rubric" : state === "done" ? "text-leaf" : ""} /><span><span className="hidden sm:inline">{i + 1}. </span>{s.name}</span></span></span>
            <span className="meta mt-0.5 hidden sm:block">{s.what}</span>
            <span className="sr-only">{state === "done" ? "Done." : state === "now" ? "You are here." : "Still to come."}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function NextStepBox({ step }: { step: NextStep }) {
  return (
    <section aria-labelledby="now" className={`block-gap border-l-4 px-5 py-5 sm:px-8 sm:py-7 ${step.waiting ? "border-edge/60 bg-sheet" : "border-leaf bg-leaf-wash/70"}`}>
      <p className="rubric mb-1">{step.waiting ? "Nothing you have to do" : "What to do now"}</p>
      <h2 id="now" className="text-2xl leading-tight sm:text-3xl">{step.title}</h2>
      <p className="mt-2 max-w-prose">{step.body}</p>
      {step.action && <Link href={step.action.href} className={`btn mt-5 ${step.waiting ? "btn-plain" : "btn-primary"}`}><Labelled>{step.action.label}</Labelled></Link>}
    </section>
  );
}
