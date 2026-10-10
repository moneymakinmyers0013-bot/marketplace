"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";

import Link from "next/link";
import { AssetGrid } from "@/components/marketplace/asset-grid";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import { apiFiltersFromActiveFilters } from "@/lib/marketplace/browse-filters";
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { NormalizedToken } from "@/lib/marketplace/types";
import {
  useCollectionListingsQuery,
  useCollectionTokensQuery,
} from "@/lib/marketplace/hooks";
import {
  formatPriceForDisplay,
  displayTokenId,
  listingPriceByTokenId,
  tokenId,
  tokenName,
  tokenPrice,
} from "@/lib/marketplace/token-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { ResourceTraitIcons } from "@/components/marketplace/resource-trait-icons";
import {
  AssetGridSkeleton,
  ListSkeleton,
} from "@/components/marketplace/loading-state";
import { TokenSymbol } from "@/components/ui/token-symbol";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCollectionFilterConfig } from "@/lib/marketplace/collection-filter-config";
import {
  exactAttributeFiltersFromActiveFilters,
  filterTokensByActiveFilters,
  type ActiveFilters,
} from "@/lib/marketplace/traits";
import { COLLECTION_LISTING_SAMPLE_LIMIT } from "@/lib/marketplace/query-limits";
import { realmResources } from "@/lib/marketplace/token-attributes";
import { cn } from "@/lib/utils";
import {
  cartItemFromTokenListing,
  cheapestListingByTokenId,
} from "@/features/cart/listing-utils";
import { useAddToCartFeedback } from "@/features/cart/hooks/use-add-to-cart-feedback";
import { type CollectionSortMode } from "@/features/collections/collection-query-params";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";

type CollectionTokenGridProps = {
  address: string;
  projectId?: string;
  cursor?: string | null;
  limit?: number;
  tokenIds?: string[];
  activeFilters?: ActiveFilters;
  sortMode?: CollectionSortMode;
  onTokensChange?: (tokens: NormalizedToken[]) => void;
  /** Controls rendered above the grid (search, sort, layout). */
  toolbar?: ReactNode;
  /** Comfortable or dense cards, or a table. */
  layout?: GridLayoutMode;
  /** Name substring or exact token id. */
  query?: string;
  /** Only tokens with a live listing in the market currency. */
  listedOnly?: boolean;
  /** Called with whether another page can be loaded. */
  onCanLoadMoreChange?: (canLoadMore: boolean) => void;
  sweepPreviewTokenIds?: Set<string>;
};

export type GridLayoutMode = "compact" | "dense" | "list";

const EMPTY_ACTIVE_FILTERS: ActiveFilters = {};
const EMPTY_TOKENS: NormalizedToken[] = [];

function dedupeTokens(tokens: NormalizedToken[]) {
  const unique = new Map<string, NormalizedToken>();

  tokens.forEach((item) => {
    unique.set(tokenId(item), item);
  });

  return Array.from(unique.values());
}

function tokenSignature(tokens: NormalizedToken[]) {
  return tokens.map((item) => tokenId(item)).join(",");
}

function normalizeAddress(address: string) {
  try {
    return `0x${BigInt(address).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
}

function numericAttribute(token: NormalizedToken, traitName: string) {
  const metadata = token.metadata as { attributes?: unknown } | null;
  if (!Array.isArray(metadata?.attributes)) {
    return null;
  }

  for (const rawAttribute of metadata.attributes) {
    if (!rawAttribute || typeof rawAttribute !== "object") {
      continue;
    }

    const attribute = rawAttribute as Record<string, unknown>;
    const resolvedTraitName = String(
      attribute.trait_type ?? attribute.traitName ?? attribute.name ?? "",
    ).trim();
    if (resolvedTraitName !== traitName) {
      continue;
    }

    const numericValue = Number(attribute.value ?? attribute.traitValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function stringAttribute(token: NormalizedToken, traitNames: string[]) {
  const metadata = token.metadata as { attributes?: unknown } | null;
  if (!Array.isArray(metadata?.attributes)) {
    return null;
  }

  const accepted = new Set(traitNames);
  for (const rawAttribute of metadata.attributes) {
    if (!rawAttribute || typeof rawAttribute !== "object") {
      continue;
    }

    const attribute = rawAttribute as Record<string, unknown>;
    const resolvedTraitName = String(
      attribute.trait_type ?? attribute.traitName ?? attribute.name ?? "",
    ).trim();
    if (!accepted.has(resolvedTraitName)) {
      continue;
    }

    const value = String(attribute.value ?? attribute.traitValue ?? "").trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function isAliveAdventurer(token: NormalizedToken) {
  const health = numericAttribute(token, "Health");
  if (health !== null && health <= 0) {
    return false;
  }

  const expiredValue = stringAttribute(token, [
    "Expired",
    "Status",
    "Alive",
    "Dead",
  ]);
  if (!expiredValue) {
    return true;
  }

  const normalized = expiredValue.toLowerCase();
  if (
    normalized === "expired" ||
    normalized === "dead" ||
    normalized === "false" ||
    normalized === "0"
  ) {
    return false;
  }

  return true;
}

type GridPaginationState = {
  cursor: string | null | undefined;
  tokens: NormalizedToken[];
};

type GridPaginationAction =
  | { type: "RESET"; cursor?: string }
  | { type: "APPEND_PAGE"; pageTokens: NormalizedToken[] }
  | { type: "ADVANCE_CURSOR"; cursor: string };

function gridPaginationReducer(
  state: GridPaginationState,
  action: GridPaginationAction,
): GridPaginationState {
  switch (action.type) {
    case "RESET":
      return { cursor: action.cursor, tokens: [] };
    case "APPEND_PAGE": {
      const next = !state.cursor
        ? dedupeTokens(action.pageTokens)
        : dedupeTokens([...state.tokens, ...action.pageTokens]);
      // Return the SAME reference so React bails out when tokens are unchanged.
      // This prevents an infinite render loop when the query returns a new object
      // reference each render (e.g. in tests) but the underlying data hasn't changed.
      if (tokenSignature(state.tokens) === tokenSignature(next)) return state;
      return { ...state, tokens: next };
    }
    case "ADVANCE_CURSOR":
      return { ...state, cursor: action.cursor };
  }
}

export function CollectionTokenGrid({
  address,
  projectId,
  cursor: initialCursor,
  limit = 24,
  tokenIds,
  activeFilters,
  sortMode = "recent",
  onTokensChange,
  toolbar,
  layout = "compact",
  query = "",
  listedOnly = false,
  onCanLoadMoreChange,
  sweepPreviewTokenIds,
}: CollectionTokenGridProps) {
  const currency = useMarketCurrency((state) => state.currency);
  const { addListingToCart, isRecentlyAdded } = useAddToCartFeedback();
  const collectionFilterConfig = useMemo(
    () => getCollectionFilterConfig(address),
    [address],
  );
  const showInlineResources =
    collectionFilterConfig.showInlineResources === true;
  const tokenCardConfig = collectionFilterConfig.tokenCard;
  const gridMode = layout;
  const tokenIdsKey = useMemo(() => tokenIds?.join(",") ?? "", [tokenIds]);
  const activeFiltersKey = useMemo(
    () =>
      activeFilters
        ? Object.entries(activeFilters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${Array.from(v).sort().join(",")}`)
            .join("|")
        : "",
    [activeFilters],
  );
  const attributeFilters = useMemo(
    () => exactAttributeFiltersFromActiveFilters(activeFilters),
    [activeFilters],
  );
  const [pagination, dispatch] = useReducer(gridPaginationReducer, {
    cursor: initialCursor ?? undefined,
    tokens: [],
  });

  const tokenQuery = useCollectionTokensQuery({
    address,
    project: projectId,
    limit,
    tokenIds,
    cursor: pagination.cursor,
    fetchImages: true,
    attributeFilters,
    sort: sortMode,
    currency,
    q: query || undefined,
    listedOnly,
    filters: apiFiltersFromActiveFilters(activeFilters ?? {}),
  });
  const listingQuery = useCollectionListingsQuery({
    collection: address,
    projectId,
    limit: COLLECTION_LISTING_SAMPLE_LIMIT,
    verifyOwnership: false,
  });

  const onTokensChangeRef = useRef(onTokensChange);
  const emittedVisibleTokensSignatureRef = useRef("");
  useEffect(() => {
    onTokensChangeRef.current = onTokensChange;
  });

  useEffect(() => {
    dispatch({ type: "RESET", cursor: initialCursor ?? undefined });
  }, [
    initialCursor,
    address,
    projectId,
    limit,
    tokenIdsKey,
    activeFiltersKey,
    sortMode,
    currency,
    query,
    listedOnly,
  ]);

  useEffect(() => {
    if (!tokenQuery.isSuccess) return;
    const pageTokens = tokenQuery.data?.page?.tokens ?? [];
    dispatch({ type: "APPEND_PAGE", pageTokens });
  }, [tokenQuery.data, tokenQuery.isSuccess]);

  // A hydrated first page must render before effects run (including on the server).
  const visibleTokens = pagination.cursor === (initialCursor ?? undefined)
    ? tokenQuery.data?.page?.tokens ?? EMPTY_TOKENS
    : pagination.tokens;
  const listingPrices = cheapestListingByTokenId([
    ...(listingQuery.data ?? []),
    ...visibleTokens.flatMap((t) =>
      t.best_listing ? [t.best_listing] : [],
    ),
  ]);
  const listingPriceMap = listingPriceByTokenId(listingQuery.data);
  const isAdventurersCollection = useMemo(
    () =>
      getMarketplaceRuntimeConfig().collections.some(
        (collection) =>
          normalizeAddress(collection.address) === normalizeAddress(address) &&
          collection.name.trim().toLowerCase() === "adventurers",
      ),
    [address],
  );

  const nextCursor = tokenQuery.data?.page?.nextCursor ?? null;
  const canLoadMore = Boolean(nextCursor);
  const onCanLoadMoreChangeRef = useRef(onCanLoadMoreChange);
  useEffect(() => {
    onCanLoadMoreChangeRef.current = onCanLoadMoreChange;
  });
  useEffect(() => {
    onCanLoadMoreChangeRef.current?.(canLoadMore);
  }, [canLoadMore]);
  // The API applies sorting and filters across the full collection before pagination.
  const filteredVisibleTokens = useMemo(
    () =>
      filterTokensByActiveFilters(
        visibleTokens,
        activeFilters ?? EMPTY_ACTIVE_FILTERS,
      ),
    [activeFilters, visibleTokens],
  );
  const displayTokens = useMemo(
    () =>
      isAdventurersCollection
        ? filteredVisibleTokens.filter(isAliveAdventurer)
        : filteredVisibleTokens,
    [filteredVisibleTokens, isAdventurersCollection],
  );
  const visibleTokensSignature = useMemo(
    () => tokenSignature(displayTokens),
    [displayTokens],
  );

  useEffect(() => {
    if (emittedVisibleTokensSignatureRef.current === visibleTokensSignature) {
      return;
    }

    emittedVisibleTokensSignatureRef.current = visibleTokensSignature;
    onTokensChangeRef.current?.(displayTokens);
  }, [displayTokens, visibleTokensSignature]);

  const sortedTokens = useMemo(() => displayTokens, [displayTokens]);
  const isListMode = gridMode === "list";
  const density = isListMode ? "compact" : gridMode;

  // Grid entrance stagger animation — re-triggers on filter/sort changes via key
  const gridAnimationKey = `${activeFiltersKey}-${sortMode}-${gridMode}`;


  return (
    <section className="space-y-4" data-testid="collection-token-grid">
      {toolbar}

      {tokenQuery.isLoading && pagination.tokens.length === 0 ? (
        isListMode ? (
          <ListSkeleton label="Loading tokens" count={6} compact />
        ) : (
          <AssetGridSkeleton
            label="Loading tokens"
            density={density}
            mediaClassName={
              tokenCardConfig?.mediaAspectRatioClassName ?? "aspect-[4/5]"
            }
            mediaTestId="token-skeleton"
          />
        )
      ) : null}

      {tokenQuery.isError ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Failed to load tokens.
          </CardContent>
        </Card>
      ) : null}

      {!tokenQuery.isLoading && !isListMode ? (
        <AssetGrid
                    key={gridAnimationKey}
          density={density}
          data-testid="collection-token-grid-cards"
        >
          {sortedTokens.map((token) => {
            const tokenKey = displayTokenId(token);
            const cheapestListing = listingPrices.get(tokenKey);
            const isAdded = isRecentlyAdded(cheapestListing?.orderId);
            const isSweepPreview = sweepPreviewTokenIds?.has(tokenKey) ?? false;
            const price =
              cheapestListing?.price ??
              listingPriceMap.get(tokenKey) ??
              tokenPrice(token);
            const cardItem = cheapestListing
              ? cartItemFromTokenListing(
                  token,
                  address,
                  cheapestListing,
                  projectId,
                )
              : null;

            return (
              <div key={tokenId(token)} data-token-card>
                <div
                  className={cn(
                    "rounded-lg transition-all duration-150",
                    isSweepPreview &&
                      "relative z-10 ring-2 ring-primary ring-offset-2 ring-offset-background",
                  )}
                >
                  <MarketplaceTokenCard
                    buyNowLabel={isAdded ? "Added" : "Add to cart"}
                    cardContentAriaLabel={`token-${tokenKey}`}
                    cardContentRole="article"
                    currency={cheapestListing?.currency ?? null}
                    href={`/collections/${address}/${tokenId(token)}`}
                    inlineTraits={
                      showInlineResources ? (
                        <ResourceTraitIcons
                          resources={realmResources(token.metadata)}
                        />
                      ) : undefined
                    }
                    linkAriaLabel={`token-${tokenKey}`}
                    mediaContainerClassName={
                      tokenCardConfig?.mediaAspectRatioClassName
                    }
                    mediaImageClassName={tokenCardConfig?.mediaImageClassName}
                    onBuyNow={
                      cardItem && !isSweepPreview
                        ? () => {
                            addListingToCart(cardItem);
                          }
                        : undefined
                    }
                    price={price}
                    showActions
                    token={token}
                  />
                </div>
              </div>
            );
          })}
        </AssetGrid>
      ) : null}

      {!tokenQuery.isLoading && isListMode ? (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table data-testid="collection-token-grid-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTokens.map((token) => {
                  const tokenKey = displayTokenId(token);
                  const cheapestListing = listingPrices.get(tokenKey);
                  const isAdded = isRecentlyAdded(cheapestListing?.orderId);
                  const isSweepPreview =
                    sweepPreviewTokenIds?.has(tokenKey) ?? false;
                  const price =
                    cheapestListing?.price ??
                    listingPriceMap.get(tokenKey) ??
                    tokenPrice(token);
                  const displayPrice =
                    token.amountsInBaseUnits && price != null
                      ? formatCurrencyAmount(price, currency)
                      : formatPriceForDisplay(price);

                  return (
                    <TableRow
                      key={tokenId(token)}
                      className={cn(isSweepPreview && "bg-muted/60")}
                    >
                      <TableCell>
                        <div className="space-y-0.5">
                          <Link
                            href={`/collections/${address}/${tokenId(token)}`}
                            className="text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {tokenName(token)}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            #{tokenKey}
                          </p>
                          {showInlineResources ? (
                            <ResourceTraitIcons
                              resources={realmResources(token.metadata)}
                              showLabels
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {displayPrice ? (
                          <p className="text-xs text-primary font-medium flex items-center gap-1">
                            {displayPrice}
                            {cheapestListing?.currency ? (
                              <TokenSymbol
                                address={cheapestListing.currency}
                                className="text-muted-foreground"
                              />
                            ) : null}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Not listed
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={!cheapestListing || isSweepPreview}
                          onClick={() => {
                            if (!cheapestListing) {
                              return;
                            }

                            addListingToCart(
                              cartItemFromTokenListing(
                                token,
                                address,
                                cheapestListing,
                                projectId,
                              ),
                            );
                          }}
                          size="sm"
                          type="button"
                          variant={
                            isAdded
                              ? "default"
                              : isSweepPreview
                                ? "secondary"
                                : "outline"
                          }
                          className="w-full sm:w-auto"
                        >
                          {isAdded
                            ? "Added"
                            : isSweepPreview
                              ? "Pending sweep"
                              : "Add to cart"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tokenQuery.isSuccess && displayTokens.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {query
              ? `Nothing matches "${query}". Try a name or an exact token id.`
              : listedOnly
                ? 'No listed items match these filters. Turn off "Listed only" to see every item.'
                : "No tokens match your filters. Try removing some filters."}
          </CardContent>
        </Card>
      ) : null}

      {canLoadMore ? (
        <div className="flex justify-center">
          <Button
            disabled={tokenQuery.isFetching}
            onClick={() => {
              if (nextCursor) {
                dispatch({ type: "ADVANCE_CURSOR", cursor: nextCursor });
              }
            }}
            type="button"
            variant="outline"
            className="min-h-11 px-6"
          >
            {tokenQuery.isFetching ? "Loading…" : "Load more items"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
