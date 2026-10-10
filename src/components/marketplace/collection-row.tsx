"use client";

import { useEffect, useMemo, useRef } from "react";
import { MarketplaceLink as Link } from "@/components/marketplace/marketplace-link";
import type { NormalizedToken } from "@/lib/marketplace/types";
import {
  useCollectionListingsQuery,
  useCollectionQuery,
  useCollectionTokensQuery,
} from "@/lib/marketplace/hooks";
import {
  displayTokenId,
  formatNumberish,
  formatPriceForDisplay,
  getTokenSymbol,
  listingPriceByTokenId,
  tokenId,
  tokenName,
  tokenPrice,
} from "@/lib/marketplace/token-display";
import { COLLECTION_LISTING_SAMPLE_LIMIT } from "@/lib/marketplace/query-limits";
import { expandTokenIdVariants } from "@/lib/marketplace/token-id";
import { matchesHomeSearch, normalizeHomeSearchQuery } from "@/lib/marketplace/home-search";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { Button } from "@/components/ui/button";
import { AssetCardSkeleton } from "@/components/marketplace/loading-state";
import {
  cartItemFromTokenListing,
  cheapestListingByTokenId,
} from "@/features/cart/listing-utils";
import { useAddToCartFeedback } from "@/features/cart/hooks/use-add-to-cart-feedback";

type CollectionRowProps = {
  address: string;
  name: string;
  projectId?: string;
  searchQuery?: string;
  onSearchMatchChange?: (address: string, isMatch: boolean) => void;
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function fallbackTokensFromListings(
  listings: unknown[] | undefined,
  limit: number,
) {
  const tokenIds: string[] = [];
  const seen = new Set<string>();

  for (const listing of listings ?? []) {
    const fields = asRecord(listing);
    if (!fields) {
      continue;
    }

    const nestedOrder = asRecord(fields.order);
    const normalizedTokenId =
      formatNumberish(fields.tokenId) ??
      formatNumberish(fields.token_id) ??
      formatNumberish(nestedOrder?.tokenId) ??
      formatNumberish(nestedOrder?.token_id);
    if (!normalizedTokenId || seen.has(normalizedTokenId)) {
      continue;
    }

    seen.add(normalizedTokenId);
    tokenIds.push(normalizedTokenId);
    if (tokenIds.length >= limit) {
      break;
    }
  }

  return tokenIds.map(
    (resolvedTokenId) =>
      ({
        token_id: resolvedTokenId,
        metadata: {},
      }) as NormalizedToken,
  );
}

function listingTokenIds(listings: unknown[] | undefined, limit: number) {
  const ids = fallbackTokensFromListings(listings, limit).map((token) =>
    String(token.token_id ?? "").trim(),
  );
  return expandTokenIdVariants(ids);
}

function floorPriceFromListings(
  cheapestListings: Map<string, { price: string; currency?: string }>,
): { price: string; currency: string | null } | null {
  let min: bigint | null = null;
  let minCurrency: string | null = null;

  for (const { price, currency } of cheapestListings.values()) {
    try {
      const val = BigInt(price);
      if (min === null || val < min) {
        min = val;
        minCurrency = currency ?? null;
      }
    } catch {
      // skip unparseable prices
    }
  }

  if (min === null) {
    return null;
  }

  const formatted = formatPriceForDisplay(min.toString());
  return formatted ? { price: formatted, currency: minCurrency } : null;
}

export function CollectionRow({
  address,
  name,
  projectId,
  searchQuery = "",
  onSearchMatchChange,
}: CollectionRowProps) {
  const onSearchMatchChangeRef = useRef(onSearchMatchChange);
  useEffect(() => { onSearchMatchChangeRef.current = onSearchMatchChange; });
  const { addListingToCart, isRecentlyAdded } = useAddToCartFeedback();
  const collectionQuery = useCollectionQuery({ address, projectId, fetchImages: false });
  const tokenQuery = useCollectionTokensQuery({
    address,
    project: projectId,
    limit: 12,
    fetchImages: true,
  });
  const listingQuery = useCollectionListingsQuery({
    collection: address,
    projectId,
    limit: COLLECTION_LISTING_SAMPLE_LIMIT,
    verifyOwnership: false,
  });
  const listedTokenIds = useMemo(
    () => listingTokenIds(listingQuery.data, 12),
    [listingQuery.data],
  );
  const listedTokensQuery = useCollectionTokensQuery({
    address,
    project: projectId,
    tokenIds: listedTokenIds.length > 0 ? listedTokenIds : undefined,
    limit: 12,
    fetchImages: true,
  });

  const tokens = useMemo(
    () => tokenQuery.data?.page?.tokens ?? [],
    [tokenQuery.data?.page?.tokens],
  );
  const fallbackTokens = useMemo(() => {
    const requestedIds = new Set(listedTokenIds);
    const listedTokens = (listedTokensQuery.data?.page?.tokens ?? []).filter(
      (token) => requestedIds.has(displayTokenId(token)),
    );
    if (listedTokens.length > 0) {
      return listedTokens;
    }

    return fallbackTokensFromListings(listingQuery.data, 12);
  }, [listedTokenIds, listedTokensQuery.data?.page?.tokens, listingQuery.data]);
  const cheapestListings = cheapestListingByTokenId(listingQuery.data);
  const listingPrices = listingPriceByTokenId(listingQuery.data);
  const tokensForDisplay = useMemo(() => {
    if (tokens.length === 0) {
      return fallbackTokens;
    }

    const hasListings = cheapestListings.size > 0 || listingPrices.size > 0;
    if (!hasListings) {
      return tokens;
    }

    // fallbackTokens are fetched specifically for listed token IDs — prefer them
    // so we show all listed tokens, not just the subset that landed on page 1.
    if (fallbackTokens.length > 0) {
      return fallbackTokens;
    }

    // While the specific query is still loading, show any listed tokens from
    // the regular query as a temporary placeholder.
    const pricedTokens = tokens.filter((token) => {
      const key = displayTokenId(token);
      return cheapestListings.has(key) || listingPrices.has(key);
    });

    return pricedTokens.length > 0 ? pricedTokens : tokens;
  }, [cheapestListings, fallbackTokens, listingPrices, tokens]);
  const normalizedSearch = normalizeHomeSearchQuery(searchQuery);
  const collectionMatchesSearch = matchesHomeSearch(normalizedSearch, [name]);
  const filteredTokens = useMemo(() => {
    if (!normalizedSearch) {
      return tokensForDisplay;
    }

    return tokensForDisplay.filter((token) =>
      matchesHomeSearch(normalizedSearch, [tokenName(token), displayTokenId(token)]),
    );
  }, [normalizedSearch, tokensForDisplay]);
  const shouldShowLoadingRow = normalizedSearch.length > 0 &&
    !collectionMatchesSearch &&
    (tokenQuery.isLoading || listingQuery.isLoading || listedTokensQuery.isLoading);
  const matchesSearch = normalizedSearch.length === 0 ||
    collectionMatchesSearch ||
    filteredTokens.length > 0 ||
    shouldShowLoadingRow;
  const visibleTokens =
    normalizedSearch.length > 0 && !collectionMatchesSearch
      ? filteredTokens
      : tokensForDisplay;

  useEffect(() => {
    onSearchMatchChangeRef.current?.(address, matchesSearch);
  }, [address, matchesSearch]);

  if (!matchesSearch) {
    return null;
  }

  const totalSupply = collectionQuery.data?.totalSupply;
  const listingCount = Array.isArray(listingQuery.data) ? listingQuery.data.length : 0;
  const listingCountLabel =
    listingCount >= COLLECTION_LISTING_SAMPLE_LIMIT
      ? `${COLLECTION_LISTING_SAMPLE_LIMIT}+`
      : String(listingCount);
  const floor = floorPriceFromListings(cheapestListings);

  return (
    <section className="space-y-3">
      {/* Heading with stats — padded for readability */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 lg:px-8">
        <h2 className="realm-kicker text-lg">
          <Link href={`/collections/${address}`} className="hover:text-foreground transition-colors">
            {name}
          </Link>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {totalSupply !== undefined && (
            <span>{Number(totalSupply).toLocaleString()} items</span>
          )}
          {listingCount > 0 && (
            <span>{listingCountLabel} listed</span>
          )}
          {floor && (
            <span className="text-foreground font-medium flex items-center gap-1">
              Floor: {floor.price}
              {floor.currency ? (
                <span className="text-muted-foreground font-normal">{getTokenSymbol(floor.currency)}</span>
              ) : null}
            </span>
          )}
        </div>
      </div>

      {/* Scroll row — edge-to-edge, padded with px on inner items */}
      {tokenQuery.isLoading ? (
        <div role="status" aria-label="Loading collection tokens" className="flex gap-3 overflow-x-auto pb-2 px-4 sm:px-6 lg:px-8">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="w-48 shrink-0"><AssetCardSkeleton mediaTestId="collection-row-skeleton" /></div>
          ))}
        </div>
      ) : null}

      {tokenQuery.isSuccess &&
      visibleTokens.length === 0 &&
      !listingQuery.isLoading ? (
        <p className="text-sm text-muted-foreground font-mono px-4 sm:px-6 lg:px-8">
          <span className="text-primary mr-1">$</span>
          ls tokens/ -- (empty)
        </p>
      ) : null}

      {tokenQuery.isSuccess && visibleTokens.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 px-4 sm:px-6 lg:px-8">
          {visibleTokens.map((token) => {
            const tokenKey = displayTokenId(token);
            const cheapestListing = cheapestListings.get(tokenKey);
            const isAdded = isRecentlyAdded(cheapestListing?.orderId);
            const price =
              cheapestListing?.price ??
              listingPrices.get(tokenKey) ??
              tokenPrice(token);

            return (
              <div key={tokenId(token)} className="w-48 shrink-0 space-y-2">
                <MarketplaceTokenCard
                  href={`/collections/${address}/${tokenId(token)}`}
                  price={price}
                  currency={cheapestListing?.currency}
                  token={token}
                />
                <Button
                  className="w-full"
                  disabled={!cheapestListing}
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
                  variant={isAdded ? "default" : "outline"}
                >
                  {isAdded ? "Added" : "Add to cart"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
