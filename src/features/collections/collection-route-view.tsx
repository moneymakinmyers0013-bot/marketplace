"use client";
import { CollectionBanner } from "./collection-banner";
import { CollectionBrowseLayout } from "./collection-browse-layout";
import { useSweepCandidates } from "./use-sweep-candidates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedToken } from "@/lib/marketplace/types";
import {
  useCollectionQuery,
  useTraitNamesSummaryQuery,
  useTraitValuesQuery,
} from "@/lib/marketplace/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type SeedCollection,
  getMarketplaceRuntimeConfig,
} from "@/lib/marketplace/config";
import {
  flattenExactActiveFilters,
  type ActiveFilters,
  type TraitSelection,
} from "@/lib/marketplace/traits";
import { animate, stagger } from "animejs";
import dynamic from "next/dynamic";
import { CollectionTokenGrid, type GridLayoutMode } from "@/features/collections/collection-token-grid";
import { TraitFilterSidebar } from "@/features/collections/trait-filter-sidebar";
import { CollectionToolbar } from "@/features/collections/collection-toolbar";
import { ActiveFilterChips } from "@/features/collections/active-filter-chips";
import { CollectionStatsStrip } from "@/features/collections/collection-stats-strip";
import { CurrencySwitcher } from "@/features/trading/currency-switcher";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import {
  getCollectionFilterConfig,
  type CollectionSortOption,
} from "@/lib/marketplace/collection-filter-config";
import { getCollectionBannerImage } from "@/lib/marketplace/collection-banners";
import { CART_MAX_ITEMS, useCartStore } from "@/features/cart/store/cart-store";
import {
  COLLECTION_TABS,
  type CollectionSortMode,
  type CollectionTab,
} from "@/features/collections/collection-query-params";
import { SweepBar } from "@/features/collections/sweep-bar";

const CollectionAnalytics = dynamic(
  () =>
    import("@/features/collections/analytics/collection-analytics").then((m) => ({
      default: m.CollectionAnalytics,
    })),
  { ssr: false },
);
const CollectionActivityFeed = dynamic(
  () =>
    import("@/features/collections/collection-activity-feed").then((m) => ({
      default: m.CollectionActivityFeed,
    })),
  { ssr: false },
);
const CollectionOffersPanel = dynamic(
  () =>
    import("@/features/collections/collection-offers-panel").then((m) => ({
      default: m.CollectionOffersPanel,
    })),
  { ssr: false },
);

const EMPTY_ACTIVE_FILTERS: ActiveFilters = {};
const EMPTY_VISIBLE_TOKENS: NormalizedToken[] = [];
const TAB_LABELS: Record<CollectionTab, string> = {
  items: "Items",
  offers: "Offers",
  activity: "Activity",
  analytics: "Analytics",
};

type CollectionRouteViewProps = {
  address: string;
  cursor?: string | null;
  collections?: SeedCollection[];
  activeFilters?: ActiveFilters;
  sortMode?: CollectionSortMode;
  query?: string;
  listedOnly?: boolean;
  tab?: CollectionTab;
  onActiveFiltersChange?: (filters: ActiveFilters) => void;
  onSortModeChange?: (sortMode: CollectionSortMode) => void;
  onQueryChange?: (query: string) => void;
  onListedOnlyChange?: (listedOnly: boolean) => void;
  onTabChange?: (tab: CollectionTab) => void;
};

const DEFAULT_SORT_OPTIONS: CollectionSortOption[] = [
  {
    label: "Price",
    values: { asc: "price-asc", desc: "price-desc" },
    defaultDirection: "asc",
  },
  {
    label: "Recent",
    values: { asc: "recent", desc: "recent" },
    defaultDirection: "asc",
  },
];

function collectionName(metadata: unknown, fallbackAddress: string) {
  if (metadata && typeof metadata === "object") {
    const name = (metadata as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name;
    }
  }

  return fallbackAddress;
}

function collectionHeaderImage(metadata: unknown) {
  if (metadata && typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    const image = record.banner_image ?? record.bannerImage ?? record.image ?? record.image_url;
    if (typeof image === "string" && image.trim().length > 0) {
      return image.trim();
    }
  }

  return null;
}

export function CollectionRouteView({
  address,
  cursor,
  collections,
  activeFilters,
  sortMode = "price-asc",
  query = "",
  listedOnly = false,
  tab = "items",
  onActiveFiltersChange,
  onSortModeChange,
  onQueryChange,
  onListedOnlyChange,
  onTabChange,
}: CollectionRouteViewProps) {
  const cartItems = useCartStore((state) => state.items);
  const cartOrderIds = useMemo(
    () => new Set(cartItems.map((item) => item.orderId)),
    [cartItems],
  );
  const addCandidates = useCartStore((state) => state.addCandidates);
  const setCartOpen = useCartStore((state) => state.setOpen);
  const currency = useMarketCurrency((state) => state.currency);
  const runtimeCollections = useMemo(
    () => collections ?? getMarketplaceRuntimeConfig().collections,
    [collections],
  );
  const resolvedActiveFilters = activeFilters ?? EMPTY_ACTIVE_FILTERS;
  const selectedCollection = useMemo(
    () =>
      runtimeCollections.find(
        (collectionEntry) => collectionEntry.address === address,
      ),
    [address, runtimeCollections],
  );
  const projectId = selectedCollection?.projectId;
  const sweepScopeKey = `${address}-${projectId ?? "default"}`;
  const [sweepCount, setSweepCount] = useState(0);
  const [layout, setLayout] = useState<GridLayoutMode>("compact");
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [visibleTokensByScope, setVisibleTokensByScope] = useState<
    Record<string, NormalizedToken[]>
  >({});
  const collection = useCollectionQuery({ address, projectId, fetchImages: true });
  const traitNamesQuery = useTraitNamesSummaryQuery({ address, projectId });
  const [openTraitName, setOpenTraitName] = useState<string | null>(null);

  const otherTraitFilters = useMemo(() => {
    if (!openTraitName) return undefined;
    const result: TraitSelection[] = flattenExactActiveFilters(resolvedActiveFilters)
      .filter((entry) => entry.name !== openTraitName);
    return result.length > 0 ? result : undefined;
  }, [openTraitName, resolvedActiveFilters]);

  const traitValuesQuery = useTraitValuesQuery({
    address,
    traitName: openTraitName,
    otherTraitFilters,
    projectId,
  });

  const seedName = selectedCollection?.name?.trim() || null;
  const displayName = seedName
    ?? (collection.isSuccess && collection.data
      ? collectionName(collection.data.metadata, address)
      : null);
  const headerImage = collection.isSuccess && collection.data
    ? collectionHeaderImage(collection.data.metadata) ?? getCollectionBannerImage(displayName ?? seedName)
    : getCollectionBannerImage(seedName);
  const collectionFilterConfig = useMemo(
    () => getCollectionFilterConfig(address, runtimeCollections),
    [address, runtimeCollections],
  );
  const sortOptions = collectionFilterConfig.sortOptions ?? DEFAULT_SORT_OPTIONS;

  // Hero entrance animation
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      hero.querySelectorAll<HTMLElement>(".hero-image, .hero-content > *").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const img = hero.querySelector<HTMLElement>(".hero-image");
    if (img) {
      animate(img, { opacity: [0, 1], duration: 600, ease: "easeOutCubic" });
    }

    const contentChildren = hero.querySelectorAll<HTMLElement>(".hero-content > *");
    if (contentChildren.length > 0) {
      animate(contentChildren, {
        opacity: [0, 1],
        translateY: [12, 0],
        delay: stagger(60, { start: 300 }),
        duration: 500,
        ease: "spring(1, 120, 20, 0)",
      });
    }
  }, [address]);

  const visibleTokens = visibleTokensByScope[sweepScopeKey] ?? EMPTY_VISIBLE_TOKENS;

  const sweepQuery = useSweepCandidates(address, resolvedActiveFilters);
  const sweepCandidates = (sweepQuery.data ?? []).filter(item => !cartOrderIds.has(item.orderId)).slice(0, CART_MAX_ITEMS);
  const sweepMaxCount = Math.min(
    sweepCandidates.length,
    Math.max(CART_MAX_ITEMS - cartItems.length, 0),
  );
  const clampedSweepCount = Math.min(sweepCount, sweepMaxCount);
  const sweepPreviewTokenIds = useMemo(
    () => new Set(sweepCandidates.slice(0, clampedSweepCount).map(item => item.tokenId)),
    [sweepCandidates, clampedSweepCount],
  );
  const handleTokensChange = useCallback((tokens: NormalizedToken[]) => {
    setVisibleTokensByScope((current) => {
      if (current[sweepScopeKey] === tokens) {
        return current;
      }

      return {
        ...current,
        [sweepScopeKey]: tokens,
      };
    });
  }, [sweepScopeKey]);

  const handleSweepCountChange = useCallback(
    (nextCount: number) => {
      setSweepCount(Math.min(Math.max(nextCount, 0), sweepMaxCount));
    },
    [sweepMaxCount],
  );

  const handleSweep = useCallback(() => {
    const selected = sweepCandidates.slice(0, clampedSweepCount);
    if (selected.length === 0) return;
    addCandidates(selected);
    setCartOpen(true);
    setSweepCount(0);
  }, [sweepCandidates, clampedSweepCount, addCandidates, setCartOpen]);

  const removeFilter = useCallback(
    (traitName: string, traitValue: string) => {
      const next: ActiveFilters = Object.fromEntries(
        Object.entries(resolvedActiveFilters).map(([name, values]) => [name, new Set(values)]),
      );
      next[traitName]?.delete(traitValue);
      if (next[traitName]?.size === 0) delete next[traitName];
      onActiveFiltersChange?.(next);
    },
    [onActiveFiltersChange, resolvedActiveFilters],
  );

  const resultSummary =
    visibleTokens.length > 0
      ? `Showing ${visibleTokens.length} item${visibleTokens.length === 1 ? "" : "s"}${canLoadMore ? ", more available" : ""}`
      : undefined;

  // Chips summarise the filters in effect, so they sit directly under the controls they refine.
  const toolbar = (
    <div className="space-y-3">
      <CollectionToolbar
        query={query}
        onQueryChange={(next) => onQueryChange?.(next)}
        listedOnly={listedOnly}
        onListedOnlyChange={(next) => onListedOnlyChange?.(next)}
        sortMode={sortMode}
        sortOptions={sortOptions}
        onSortModeChange={(next) => onSortModeChange?.(next)}
        layout={layout}
        onLayoutChange={setLayout}
        resultSummary={resultSummary}
      />
      <ActiveFilterChips
        activeFilters={resolvedActiveFilters}
        onRemove={removeFilter}
        onClear={() => onActiveFiltersChange?.({})}
      />
    </div>
  );

  return (
    <section className="w-full space-y-8 pb-20">
      <CollectionBanner ref={heroRef} image={headerImage} name={displayName ?? selectedCollection?.name ?? address}>
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
          <CurrencySwitcher label="Browse in" showBalance />
          <CollectionStatsStrip address={address} currency={currency} />
        </div>
      </CollectionBanner>

      {collection.isSuccess && !collection.data ? (
        <p className="text-sm text-muted-foreground font-mono">
          <span className="text-primary mr-1">$</span>
          find collection -- not found
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => onTabChange?.(value as CollectionTab)} className="w-full gap-4">
        <TabsList className="h-11 max-w-full self-start overflow-x-auto">
          {COLLECTION_TABS.map((value) => (
            <TabsTrigger key={value} value={value} className="min-w-20 px-4 text-sm">
              {TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="items">
          <CollectionBrowseLayout activeCount={Object.keys(resolvedActiveFilters).length} filters={
              <TraitFilterSidebar
                collectionAddress={address}
                traitNames={traitNamesQuery.data ?? []}
                activeFilters={resolvedActiveFilters}
                onActiveFiltersChange={onActiveFiltersChange}
                isLoading={traitNamesQuery.isLoading}
                traitValues={traitValuesQuery.data ?? null}
                isLoadingValues={traitValuesQuery.isLoading}
                openTraitName={openTraitName}
                onOpenTraitNameChange={setOpenTraitName}
              />
          }>
            <CollectionTokenGrid
              cursor={cursor}
              key={sweepScopeKey}
              activeFilters={resolvedActiveFilters}
              address={address}
              layout={layout}
              listedOnly={listedOnly}
              onCanLoadMoreChange={setCanLoadMore}
              onTokensChange={handleTokensChange}
              projectId={projectId}
              query={query}
              sortMode={sortMode}
              sweepPreviewTokenIds={sweepPreviewTokenIds}
              toolbar={toolbar}
            />
            <SweepBar
              candidates={sweepCandidates}
              count={sweepCount}
              maxCount={sweepMaxCount}
              onCountChange={handleSweepCountChange}
              onSweep={handleSweep}
            />
          </CollectionBrowseLayout>
        </TabsContent>
        <TabsContent value="offers">
          {tab === "offers" ? <CollectionOffersPanel address={address} currency={currency} /> : null}
        </TabsContent>
        <TabsContent value="activity">
          {tab === "activity" ? <CollectionActivityFeed address={address} /> : null}
        </TabsContent>
        <TabsContent value="analytics">
          {tab === "analytics" ? <CollectionAnalytics address={address} currency={currency} /> : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
