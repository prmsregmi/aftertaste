import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { SITE_NAME } from "@/lib/aftertaste/guide";

export function SiteHeader() {
  return (
    <header className="flex items-start justify-between gap-4 px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
      <Link href="/" aria-label={SITE_NAME} className="-m-1 p-1 text-foreground">
        <svg viewBox="0 0 24 24" aria-hidden className="size-12 -rotate-3">
          {/* Read path down, write-back path up, drawn by hand. */}
          <path
            d="M7.6 3.2c-.6 2.4-.1 5.1-.4 7.8-.2 2.9.3 5.8-.1 9.1M3.6 15.4c1.2 1.6 2.5 3.4 3.5 5.2.9-1.9 2.4-3.6 4-5M16.4 21c.4-3.2-.2-6.3.1-9.4.2-2.9-.3-5.6.3-8.3M12.6 8.6c1.6-1.6 2.9-3.4 4.2-5.4 1 1.9 2.3 3.4 3.8 4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <ModeToggle />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 px-6 pb-8 sm:px-12 lg:px-16 human:hidden">
      <p className="text-sm text-muted-foreground">Self-reported and screened, never certified true.</p>
    </footer>
  );
}
