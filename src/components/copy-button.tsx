"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function CodeLine({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-2">
      <code className="min-w-0 flex-1 overflow-x-auto px-1 py-1 font-mono text-[13px] leading-relaxed whitespace-pre">
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}
