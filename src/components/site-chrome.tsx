import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { SITE_NAME } from "@/lib/commons/guide";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-primary">
            {/* Read path down, write-back path up. */}
            <path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          {SITE_NAME}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          <Link href="/subjects" className="text-muted-foreground hover:text-foreground human:hidden">
            Subjects
          </Link>
          <Link href="/docs" className="text-muted-foreground hover:text-foreground human:hidden">
            Docs
          </Link>
          <a href="/llms.txt" className="text-muted-foreground hover:text-foreground human:hidden">
            llms.txt
          </a>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border human:hidden">
      <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
        Self-reported and screened, never certified true.
      </p>
    </footer>
  );
}
