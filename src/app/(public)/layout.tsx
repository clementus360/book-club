import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between gap-x-4 border-b border-rule py-4 sm:py-5">
        <Wordmark className="text-xl sm:text-2xl" />
        <nav aria-label="Main" className="flex items-center gap-4 text-[0.9375rem] whitespace-nowrap sm:gap-7">
          <Link href="/#how-it-works" className="hidden py-2 hover:underline underline-offset-4 sm:block">How it works</Link>
          <Link href="/login" className="py-2 hover:underline underline-offset-4">Sign in</Link>
          <Link href="/signup" className="btn btn-primary px-3 sm:px-4">Get started</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-14 flex flex-wrap justify-between gap-4 border-t border-rule py-8 text-sm text-soft lg:mt-20">
        <p>Commonplace. Good books. Better conversations.</p>
        <nav aria-label="Legal" className="flex gap-6">
          <Link href="/privacy" className="hover:underline underline-offset-4">Privacy</Link>
          <Link href="/terms" className="hover:underline underline-offset-4">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
