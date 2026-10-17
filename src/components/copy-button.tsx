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
}

function selectContents(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function CopyButton({ value, targetRef, label = "Copy", copiedLabel = "Copied", className, size = "sm" }: CopyButtonProps) {
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
    <Button type="button" variant="outline" size={size} onClick={copy} className={className}>
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
    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-2">
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

// A note torn from a ruled notebook, holding the prompt a person pastes into their assistant.
export function PromptNote({ value }: { value: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  return (
    <figure
      className={cn(
        "relative rounded-sm bg-white px-5 pt-8 pb-6 text-foreground shadow-[0_18px_40px_-18px_rgb(20_33_26/0.5)] sm:-rotate-[0.6deg] sm:pr-8 sm:pl-16",
        // Ruled lines every 2rem, matching the text's line height, nudged up so words sit on them.
        "bg-[repeating-linear-gradient(to_bottom,transparent_0_calc(2rem-1px),var(--rule)_calc(2rem-1px)_2rem)] bg-position-[0_-0.45rem]",
        // Red margin line.
        "sm:after:absolute sm:after:inset-y-0 sm:after:left-11 sm:after:w-0.5 sm:after:bg-human/70",
        // A strip of tape holding the note to the page.
        "before:absolute before:-top-3 before:left-1/2 before:h-7 before:w-28 before:-translate-x-1/2 before:rotate-3 before:bg-highlight/85",
      )}
    >
      <p ref={ref} className="text-[1.05rem] leading-8 whitespace-pre-line wrap-anywhere">
        {value}
      </p>
      <CopyButton
        value={value}
        targetRef={ref}
        label="Copy for your AI"
        size="lg"
        className="mt-6 h-12 w-full rounded-full border-2 border-foreground bg-human px-6 text-base font-bold text-foreground shadow-[0_4px_0_var(--foreground)] hover:bg-highlight active:translate-y-1 active:shadow-none sm:w-auto"
      />
    </figure>
  );
}
