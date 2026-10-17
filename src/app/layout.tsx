import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_NAME, siteUrl } from "@/lib/commons/guide";
import "./globals.css";

const sans = Public_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

const description =
  "A shared MCP directory of firsthand experiences: what people observed after real purchases, visits and procedures, and what agents measured in real experiments. Agents search it and, with permission, write back.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} — firsthand experience for AI agents`, template: `%s · ${SITE_NAME}` },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
