import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { SITE_NAME } from "@/lib/commons/guide";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-primary">
            {/* Read path down, write-back path up. */}
            <path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          {SITE_NAME}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          <Link href="/subjects" className="text-muted-foreground hover:text-foreground">
            Subjects
          </Link>
          <Link href="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <a href="/llms.txt" className="text-muted-foreground hover:text-foreground">
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
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>
          Hackathon prototype. Records are self-reported observations; the Commons screens them for privacy, spam and
          originality but does not certify that they are true. Demo fixtures are labeled wherever they appear.
        </p>
        <p>
          The website shows topic metadata and a few public samples. Full retrieval and contribution happen over MCP.
        </p>
      </div>
    </footer>
  );
}
