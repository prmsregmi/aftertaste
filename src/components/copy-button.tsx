"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "idle" | "copied" | "selected";

interface CopyButtonProps {
  value: string;
  // Element whose text gets selected when the clipboard is unavailable, so the person can copy by hand.
  targetRef: RefObject<HTMLElement | null>;
  label?: string;
  copiedLabel?: string;
  className?: string;
  size?: "sm" | "lg";
  variant?: "outline" | "link";
}

function selectContents(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function CopyButton({
  value,
  targetRef,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  size = "sm",
  variant = "outline",
}: CopyButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [shortcut, setShortcut] = useState("Ctrl+C");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      // Clipboard blocked (permissions, insecure origin, embedded frame): fall back to a manual copy.
      if (targetRef.current) selectContents(targetRef.current);
      setShortcut(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘C" : "Ctrl+C");
      setStatus("selected");
    }
    setTimeout(() => setStatus("idle"), 3000);
  }

  const text = { idle: label, copied: copiedLabel, selected: `Selected, press ${shortcut}` }[status];

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={className}>
      {text}
      <span aria-live="polite" className="sr-only">
        {status === "copied" && "Copied to clipboard."}
        {status === "selected" && `Text selected. Press ${shortcut} to copy.`}
      </span>
    </Button>
  );
}

export function CodeLine({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <div className="min-w-0 flex items-start gap-2 rounded-md border border-border bg-card p-2">
      <code
        ref={ref}
        className="min-w-0 flex-1 overflow-x-auto px-1 py-1 font-mono text-[13px] leading-relaxed whitespace-pre"
      >
        {value}
      </code>
      <CopyButton value={value} targetRef={ref} />
    </div>
  );
}

// Code set inline in running text, with a quiet text-style copy action.
export function InlineCode({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <p className="flex flex-wrap items-baseline gap-x-4">
      <code ref={ref} className="min-w-0 font-mono text-[0.7em] wrap-anywhere">
        {value}
      </code>
      <CopyButton
        value={value}
        targetRef={ref}
        variant="link"
        className="h-auto px-0 font-sans text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
      />
    </p>
  );
}

function RobotSticker({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      className={cn("drop-shadow-[0_4px_6px_rgb(20_33_26/0.25)]", className)}
    >
      <rect x="4" y="2" width="112" height="114" rx="30" className="fill-card" />
      <line x1="60" y1="30" x2="60" y2="17" strokeWidth="4" className="stroke-foreground" />
      <circle cx="60" cy="13" r="6" strokeWidth="3.5" className="fill-human stroke-foreground" />
      <rect x="10" y="52" width="12" height="24" rx="4" strokeWidth="3.5" className="fill-human stroke-foreground" />
      <rect x="98" y="52" width="12" height="24" rx="4" strokeWidth="3.5" className="fill-human stroke-foreground" />
      <rect x="20" y="30" width="80" height="66" rx="18" strokeWidth="4" className="fill-highlight stroke-foreground" />
      <circle cx="45" cy="58" r="9" strokeWidth="3.5" className="fill-card stroke-foreground" />
      <circle cx="47" cy="59" r="4" className="fill-foreground" />
      {/* Winking eye. */}
      <path d="M67 60 q9 -9 18 0" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-foreground" />
      <path d="M44 78 q16 12 32 0" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-foreground" />
    </svg>
  );
}

// A note torn from a ruled notebook with one job: copy the instructions a person hands to their assistant.
// The instructions themselves stay off screen; they only appear, preselected, if the clipboard is blocked.
// Everything inside is sized in em, and the em follows the note's width.
export function PromptNote({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("manual");
      requestAnimationFrame(() => ref.current?.select());
    }
  }

  return (
    <div className="@container w-full">
      <figure
        className={cn(
          "relative rounded-sm bg-white px-[1.1em] pt-[1.9em] pb-[1.4em] text-[clamp(1.15rem,2.2cqi+0.75rem,1.8rem)] text-foreground shadow-[0_18px_40px_-18px_rgb(20_33_26/0.5)] @lg:-rotate-[0.6deg] @lg:pr-[1.5em] @lg:pl-[3em]",
          "bg-[repeating-linear-gradient(to_bottom,transparent_0_calc(1.9em-1px),var(--rule)_calc(1.9em-1px)_1.9em)] bg-position-[0_-0.45em]",
          "@lg:after:absolute @lg:after:inset-y-0 @lg:after:left-[2.2em] @lg:after:w-0.5 @lg:after:bg-human/70",
          "before:absolute before:-top-[0.6em] before:left-1/2 before:h-[1.3em] before:w-[5em] before:-translate-x-1/2 before:rotate-3 before:bg-highlight/85",
        )}
      >
        <RobotSticker className="absolute -top-[1.6em] -right-[0.9em] size-[4.4em] rotate-12" />
        <p className="pr-[3em] leading-[1.9] font-semibold">Psst. Give this to your AI.</p>
        <Button
          type="button"
          size="lg"
          onClick={copy}
          className="mt-[0.6em] h-auto min-h-11 w-full rounded-full border-2 border-foreground bg-human px-[1.2em] py-[0.5em] text-[0.8em] font-bold text-foreground shadow-[0_4px_0_var(--foreground)] hover:bg-highlight active:translate-y-1 active:shadow-none @lg:w-auto"
        >
          {status === "copied" ? "Copied! Now paste it to your AI" : "Copy AI instructions"}
          <span aria-live="polite" className="sr-only">
            {status === "copied" && "Copied to clipboard."}
            {status === "manual" && "Clipboard blocked. The instructions are selected below; copy them by hand."}
          </span>
        </Button>
        {status === "manual" && (
          <textarea
            ref={ref}
            readOnly
            value={value}
            aria-label="AI instructions"
            className="mt-[0.8em] block h-[6em] w-full resize-none rounded-md border-2 border-foreground bg-card p-[0.5em] text-[0.6em] leading-snug"
          />
        )}
      </figure>
    </div>
  );
}
