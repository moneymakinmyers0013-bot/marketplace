"use client";
import { LoadingRegion } from "@/components/marketplace/loading-state";
import { Skeleton } from "@/components/ui/skeleton";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BooleanFilter } from "@/features/collections/filters/boolean-filter";
import { RangeSliderFilter } from "@/features/collections/filters/range-slider-filter";
import { TraitPillsFilter } from "@/features/collections/filters/trait-pills-filter";
import {
  getCollectionFilterConfig,
  type PillsFilterOverride,
} from "@/lib/marketplace/collection-filter-config";
import { useEntrance } from "@/lib/animation";
import { cn } from "@/lib/utils";
import {
  type ActiveFilters,
  type PrecomputedFilterProperty,
  type TraitNameSummary,
  type TraitValueRow,
  computePrecomputedFilters,
  flattenActiveFilters,
} from "@/lib/marketplace/traits";

type TraitFilterSidebarProps = {
  collectionAddress: string;
  traitNames: TraitNameSummary[];
  activeFilters: ActiveFilters;
  onActiveFiltersChange?: (filters: ActiveFilters) => void;
  isLoading?: boolean;
  traitValues: TraitValueRow[] | null;
  isLoadingValues?: boolean;
  openTraitName: string | null;
  onOpenTraitNameChange: (traitName: string | null) => void;
};

function cloneFilters(activeFilters: ActiveFilters): ActiveFilters {
  return Object.fromEntries(
    Object.entries(activeFilters).map(([name, values]) => [name, new Set(values)]),
  );
}

export function TraitFilterSidebar({
  collectionAddress,
  traitNames,
  activeFilters,
  onActiveFiltersChange,
  isLoading,
  traitValues,
  isLoadingValues,
  openTraitName,
  onOpenTraitNameChange,
}: TraitFilterSidebarProps) {
  const [searchByTraitName, setSearchByTraitName] = useState<Record<string, string>>({});
  const collectionFilterConfig = useMemo(
    () => getCollectionFilterConfig(collectionAddress),
    [collectionAddress],
  );

  const sortedTraitNames = useMemo(
    () => {
      const order = new Map(
        (collectionFilterConfig.orderedTraits ?? []).map((traitName, index) => [
          traitName,
          index,
        ]),
      );

      return [...traitNames]
        .filter((trait) => !collectionFilterConfig.hiddenTraits.includes(trait.traitName))
        .sort((left, right) => {
          const leftOrder = order.get(left.traitName);
          const rightOrder = order.get(right.traitName);

          if (leftOrder !== undefined && rightOrder !== undefined) {
            return leftOrder - rightOrder;
          }
          if (leftOrder !== undefined) {
            return -1;
          }
          if (rightOrder !== undefined) {
            return 1;
          }

          return left.traitName.localeCompare(right.traitName);
        });
    },
    [collectionFilterConfig.hiddenTraits, collectionFilterConfig.orderedTraits, traitNames],
  );

  const openGroupValues = useMemo(() => {
    if (!traitValues || traitValues.length === 0) return [];
    const available: Record<string, Record<string, number>> = {};
    const traitName = openTraitName ?? "";
    available[traitName] = {};
    for (const row of traitValues) {
      available[traitName][row.traitValue] = row.count;
    }
    return computePrecomputedFilters(available).properties[traitName] ?? [];
  }, [traitValues, openTraitName]);

  const activeCount = flattenActiveFilters(activeFilters).length;

  function toggleFilter(traitName: string, traitValue: string) {
    const next = cloneFilters(activeFilters);
    if (!next[traitName]) {
      next[traitName] = new Set();
    }

    if (next[traitName].has(traitValue)) {
      next[traitName].delete(traitValue);
      if (next[traitName].size === 0) {
        delete next[traitName];
      }
    } else {
      next[traitName].add(traitValue);
    }

    onActiveFiltersChange?.(next);
  }

  function toggleTraitGroup(traitName: string) {
    onOpenTraitNameChange(openTraitName === traitName ? null : traitName);
  }

  function setTraitValues(traitName: string, values: string[]) {
    const next = cloneFilters(activeFilters);
    if (values.length === 0) {
      delete next[traitName];
    } else {
      next[traitName] = new Set(values);
    }

    onActiveFiltersChange?.(next);
  }

  function renderFilterControl(
    traitName: string,
    values: PrecomputedFilterProperty[],
  ) {
    const override = collectionFilterConfig.overrides[traitName];

    if (override?.type === "boolean") {
      return (
        <BooleanFilter
          traitName={traitName}
          values={values}
          activeValues={activeFilters[traitName]}
          onToggle={(traitValue) => toggleFilter(traitName, traitValue)}
        />
      );
    }

    if (override?.type === "range") {
      return (
        <RangeSliderFilter
          traitName={traitName}
          values={values}
          activeValues={activeFilters[traitName]}
          min={override.min}
          max={override.max}
          onChange={(traitValues) => setTraitValues(traitName, traitValues)}
        />
      );
    }

    const pillsOverride: PillsFilterOverride | undefined =
      override?.type === "pills" ? override : undefined;

    return (
      <TraitPillsFilter
        traitName={traitName}
        values={values}
        activeValues={activeFilters[traitName]}
        searchTerm={searchByTraitName[traitName] ?? ""}
        onSearchTermChange={(value) => {
          setSearchByTraitName((current) => ({
            ...current,
            [traitName]: value,
          }));
        }}
        onToggle={(traitValue) => toggleFilter(traitName, traitValue)}
        hideSearch={pillsOverride?.hideSearch}
        showCount={pillsOverride?.showCount}
        sort={pillsOverride?.sort}
      />
    );
  }

  function AnimatedFilterPanel({ children }: { children: React.ReactNode }) {
    const ref = useEntrance<HTMLDivElement>({
      translateY: 6,
      duration: 300,
    });
    return <div ref={ref}>{children}</div>;
  }

  return (
    <div className="realm-panel space-y-3 p-4">
      {/* Header */}
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="market-section-title">Filters</h2>
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-primary px-1 text-xs font-medium tabular-nums text-primary-foreground">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <Button
            onClick={() => onActiveFiltersChange?.({})}
            size="sm"
            type="button"
            variant="ghost"
            className="-mr-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Loading / empty states */}
      {isLoading ? (
        <LoadingRegion label="Loading traits"><div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div></LoadingRegion>
      ) : sortedTraitNames.length === 0 ? (
        <p className="text-xs text-muted-foreground">No trait data available.</p>
      ) : null}

      {/* Trait groups — single-open accordion with per-group search */}
      <div className="-mx-2 space-y-0.5">
        {sortedTraitNames.map((trait, index) => {
          const traitName = trait.traitName;
          const traitPanelId = `trait-panel-${index}`;
          const traitButtonId = `trait-toggle-${index}`;
          const isOpen = openTraitName === traitName;
          const activeInGroup = activeFilters[traitName]?.size ?? 0;

          return (
            <div key={traitName} className="space-y-1">
              <button
                id={traitButtonId}
                type="button"
                aria-controls={traitPanelId}
                aria-expanded={isOpen}
                onClick={() => toggleTraitGroup(traitName)}
                className="flex min-h-9 w-full items-center justify-between rounded-[6px] border border-transparent market-chip px-2 py-1.5 text-left text-muted-foreground transition-all duration-150 hover:border-[color:var(--realm-border-etched)] hover:bg-muted/60 hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {traitName}
                  {activeInGroup > 0 && (
                    <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-[4px] bg-primary px-0.5 text-[9px] font-medium text-primary-foreground">
                      {activeInGroup}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-muted-foreground/50 transition-transform duration-150",
                    isOpen ? "rotate-90" : "",
                  )}
                >
                  ›
                </span>
              </button>
              {isOpen ? (
                <AnimatedFilterPanel>
                  <div
                    id={traitPanelId}
                    role="region"
                    aria-labelledby={traitButtonId}
                    className="space-y-2 px-2 pb-2"
                  >
                    {isLoadingValues ? (
                      <LoadingRegion label="Loading trait values"><div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div></LoadingRegion>
                    ) : (
                      renderFilterControl(traitName, openGroupValues)
                    )}
                  </div>
                </AnimatedFilterPanel>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
