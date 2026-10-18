"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const KEYS = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "resource"] as const;

export function ContinueForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const redirect = params.get("redirect_uri");
  let app: string | null = null;
  try {
    app = redirect ? new URL(redirect).host || new URL(redirect).protocol : null;
  } catch {}

  async function onContinue() {
    setPending(true);
    setError(null);
    const body = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined]));
    const res = await fetch("/authorize/continue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
    if (res.ok && data.redirect) window.location.assign(data.redirect);
    else {
      setError(data.error ?? "Sign-in failed. Start again from your app.");
      setPending(false);
    }
  }

  if (!app || params.get("response_type") !== "code") {
    return <p className="mt-6 text-muted-foreground">This sign-in link is not valid. Start again from your app.</p>;
  }
  return (
    <>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        {app} gets a pseudonymous contributor token: no account and no personal data.
      </p>
      <Button size="lg" className="mt-8" onClick={onContinue} disabled={pending}>
        Continue
      </Button>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </>
  );
}
