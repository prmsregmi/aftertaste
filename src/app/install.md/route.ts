import { installMarkdown } from "@/lib/aftertaste/guide";

export function GET() {
  return new Response(installMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
