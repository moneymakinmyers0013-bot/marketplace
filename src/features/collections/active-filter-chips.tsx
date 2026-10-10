"use client";

import { X } from "lucide-react";
import { ResourceIcon, resourceIconSrc } from "@/components/marketplace/resource-icon";
import { Button } from "@/components/ui/button";
import { decodeRangeFilterValue, flattenActiveFilters, type ActiveFilters } from "@/lib/marketplace/traits";

type ActiveFilterChipsProps = {
  activeFilters: ActiveFilters;
  onRemove: (traitName: string, traitValue: string) => void;
  onClear: () => void;
};

function chipLabel(name: string, value: string) {
  const range = decodeRangeFilterValue(value);
  if (range) return `${name} ${range.min} to ${range.max}`;
  if (value === "true") return `${name}: yes`;
  if (value === "false") return `${name}: no`;
  return `${name}: ${value}`;
}

/** Removable summary of the filters in effect, shown above the grid. */
export function ActiveFilterChips({ activeFilters, onRemove, onClear }: ActiveFilterChipsProps) {
  const selections = flattenActiveFilters(activeFilters);
  if (selections.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filter-chips">
      <ul className="contents" aria-label="Active filters">
        {selections.map((selection) => {
          const label = chipLabel(selection.name, selection.value);
          const showIcon = selection.name === "Resource" && resourceIconSrc(selection.value);
          return (
            <li key={`${selection.name}:${selection.value}`} className="contents">
              <button
                type="button"
                onClick={() => onRemove(selection.name, selection.value)}
                aria-label={`Remove filter ${label}`}
                className="market-chip inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 pl-2.5 pr-1.5 text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showIcon ? <ResourceIcon name={selection.value} size={14} decorative /> : null}
                {label}
                <X aria-hidden className="size-3 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {selections.length > 1 ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClear}>
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
