"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

// Presentation only: flips data-mode on <html>; both modes are server-rendered with the same data.
// The #human hash makes the human view linkable without a second URL.
export function ModeToggle() {
  const human = useSyncExternalStore(
    subscribe,
    () => window.location.hash === "#human",
    () => false,
  );

  useEffect(() => {
    document.documentElement.dataset.mode = human ? "human" : "agent";
  }, [human]);

  function change(next: boolean) {
    history.replaceState(null, "", next ? "#human" : window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-human human:bg-highlight">
      <Switch checked={human} onCheckedChange={change} />
      I am Human
    </label>
  );
}
