"use client";

import { useEffect, useId, useState } from "react";
import { LayoutGrid, Grid3X3, List, Search, X } from "lucide-react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CollectionSortOption } from "@/lib/marketplace/collection-filter-config";
import type { CollectionSortMode } from "@/features/collections/collection-query-params";

export type GridLayoutMode = "compact" | "dense" | "list";

const SORT_LABELS: Record<string, string> = {
  recent: "Recently added",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

function directionLabel(label: string, direction: "asc" | "desc") {
  const lower = label.toLowerCase();
  if (lower === "price") return direction === "asc" ? "Price: low to high" : "Price: high to low";
  return direction === "desc" ? `${label}: high to low` : `${label}: low to high`;
}

/** Flattens the collection's sort options into one list of selectable modes. */
export function sortChoices(options: CollectionSortOption[]) {
  const choices: Array<{ value: string; label: string }> = [];
  for (const option of options) {
    if (option.values.asc === option.values.desc) {
      choices.push({ value: option.values.asc, label: SORT_LABELS[option.values.asc] ?? option.label });
      continue;
    }
    const first = option.defaultDirection === "desc" ? "desc" : "asc";
    const second = first === "asc" ? "desc" : "asc";
    for (const direction of [first, second] as const) {
      const value = option.values[direction];
      choices.push({ value, label: SORT_LABELS[value] ?? directionLabel(option.label, direction) });
    }
  }
  return choices;
}

type CollectionToolbarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  listedOnly: boolean;
  onListedOnlyChange: (listedOnly: boolean) => void;
  sortMode: CollectionSortMode;
  sortOptions: CollectionSortOption[];
  onSortModeChange: (sortMode: CollectionSortMode) => void;
  layout: GridLayoutMode;
  onLayoutChange: (layout: GridLayoutMode) => void;
  resultSummary?: React.ReactNode;
};

/** Search, listed-only, sort and density controls for the items tab. */
export function CollectionToolbar({
  query,
  onQueryChange,
  listedOnly,
  onListedOnlyChange,
  sortMode,
  sortOptions,
  onSortModeChange,
  layout,
  onLayoutChange,
  resultSummary,
}: CollectionToolbarProps) {
  const listedId = useId();
  // The draft follows the URL query; typing diverges from it until the debounce commits.
  const [typed, setTyped] = useState({ query, value: query });
  const draft = typed.query === query ? typed.value : query;
  const setDraft = (value: string) => setTyped({ query, value });
  useEffect(() => {
    if (draft.trim() === query) return;
    const timer = setTimeout(() => onQueryChange(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, query, onQueryChange]);

  const choices = sortChoices(sortOptions);
  const sortValue = choices.some((choice) => choice.value === sortMode) ? sortMode : choices[0]?.value;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="collection-toolbar">
      <form
        role="search"
        className="relative min-w-0 flex-1 basis-56"
        onSubmit={(event) => {
          event.preventDefault();
          onQueryChange(draft.trim());
        }}
      >
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search this collection"
          placeholder="Name or token id"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-10 pl-9 pr-9"
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              onQueryChange("");
            }}
            className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </form>

      <label
        htmlFor={listedId}
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/80 px-3 text-xs font-medium text-muted-foreground has-[[data-state=checked]]:text-foreground"
      >
        <Switch id={listedId} checked={listedOnly} onCheckedChange={onListedOnlyChange} size="sm" />
        Listed only
      </label>

      <Select value={sortValue} onValueChange={(value) => onSortModeChange(value as CollectionSortMode)}>
        <SelectTrigger aria-label="Sort items" className="min-w-44 text-xs data-[size=default]:h-10">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroupPrimitive.Root
        type="single"
        value={layout}
        aria-label="Layout"
        onValueChange={(value) => {
          if (value) onLayoutChange(value as GridLayoutMode);
        }}
        className="market-segmented h-10"
      >
        {(
          [
            ["compact", "Comfortable grid", LayoutGrid],
            ["dense", "Dense grid", Grid3X3],
            ["list", "List", List],
          ] as const
        ).map(([value, label, Icon]) => (
          <ToggleGroupPrimitive.Item
            key={value}
            value={value}
            aria-label={label}
            title={label}
            className="market-segment w-9"
          >
            <Icon className="size-4" />
          </ToggleGroupPrimitive.Item>
        ))}
      </ToggleGroupPrimitive.Root>

      {resultSummary ? (
        <p className="market-label basis-full tabular-nums sm:ml-auto sm:basis-auto" aria-live="polite">
          {resultSummary}
        </p>
      ) : null}
    </div>
  );
}
