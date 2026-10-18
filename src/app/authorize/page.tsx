import type { Metadata } from "next";
import { Suspense } from "react";
import { ContinueForm } from "./continue-form";

export const metadata: Metadata = { title: "Connect", robots: { index: false } };

// OAuth authorize page for chat apps: one Continue button, no account.
export default function AuthorizePage() {
  return (
    <main className="max-w-[40rem] px-6 pt-12 pb-10 sm:px-12 lg:px-16">
      <h1 className="text-3xl font-bold">Connect to Aftertaste</h1>
      <Suspense>
        <ContinueForm />
      </Suspense>
    </main>
  );
}
