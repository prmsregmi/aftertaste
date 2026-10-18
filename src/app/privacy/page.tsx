import type { Metadata } from "next";
import { PRIVACY } from "@/lib/aftertaste/guide";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Aftertaste stores, what it hashes and for how long, who processes it, and how records are removed.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="max-w-[56rem] px-6 pt-12 pb-10 sm:px-12 lg:px-16">
      <h1 className="text-3xl font-bold">Privacy and data handling</h1>
      {PRIVACY.map((p) => (
        <section key={p.heading}>
          <h2 className="mt-10 text-xl font-bold">{p.heading}</h2>
          <p className="mt-2 leading-relaxed">{p.body}</p>
        </section>
      ))}
    </main>
  );
}
