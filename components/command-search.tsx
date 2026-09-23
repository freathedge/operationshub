"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchResult, SearchResultType } from "@/lib/domain/search";

const TYPE_LABELS: Record<SearchResultType, string> = {
  task: "Tasks",
  request: "Requests",
  asset: "Assets",
  employee: "Employees",
  operation: "Operations",
};

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    // No setState here for the empty-query case: an empty query's "no results" state is
    // derived below (via visibleResults), not stored — resetting stored `results` from
    // inside an effect body would cascade a render for state we can compute during render
    // instead (react-hooks/set-state-in-effect).
    if (!trimmedQuery) return;
    const timeoutId = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
      if (!response.ok) return;
      const body = await response.json();
      setResults(body.results as SearchResult[]);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [trimmedQuery]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    onOpenChange(false);
    setQuery("");
  }

  const visibleResults = trimmedQuery ? results : [];
  const groups = new Map<SearchResultType, SearchResult[]>();
  for (const result of visibleResults) {
    const existing = groups.get(result.type) ?? [];
    existing.push(result);
    groups.set(result.type, existing);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tasks, requests, assets..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Array.from(groups.entries()).map(([type, items]) => (
          <CommandGroup key={type} heading={TYPE_LABELS[type]}>
            {items.map((item) => (
              <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
