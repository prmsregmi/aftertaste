import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Plain GET form so it works without JavaScript and for browsing agents.
export function SubjectSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/subjects" method="get" role="search" className="flex gap-2">
      <label htmlFor="subject-q" className="sr-only">
        Search subjects
      </label>
      <Input
        id="subject-q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="e.g. Canyon jacket, DMV skills test, mcp-handler"
        className="h-10 bg-card"
      />
      <Button type="submit" className="h-10 px-4">
        Search
      </Button>
    </form>
  );
}
