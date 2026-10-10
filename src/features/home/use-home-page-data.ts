"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { homeCollectionsOptions, orderCollections } from "./home-query-options";
import { sameCurrency, useMarketCurrency } from "@/lib/marketplace/currency-store";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import type {
  CollectionCardData,
  FeaturedCollection,
  TrendingToken,
} from "./types";
import { getCollectionImage } from "@/lib/marketplace/collection-banners";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";

export { orderCollections } from "./home-query-options";

export function useHomePageData() {
  const currency = useMarketCurrency((s) => s.currency);
  const query = useQuery(homeCollectionsOptions());
  const configured = getMarketplaceRuntimeConfig().collections;
  const collectionCards = useMemo<CollectionCardData[]>(
    () =>
      orderCollections(query.data ?? [], configured).map((c) => {
        const floor = c.floorByCurrency.find((f) => sameCurrency(f.currency, currency));
        return {
          address: c.address,
          name: c.name,
          imageUrl: c.image ?? getCollectionImage(c.name),
          floorPrice: floor ? formatCurrencyAmount(floor.price, currency) : null,
          floorRaw: floor?.price ?? null,
          floorCurrency: currency,
          totalSupply: c.tokenCount,
          listingCount: c.listingCount,
          verified: c.verified ?? false,
        };
      }),
    [query.data, configured, currency],
  );
  return {
    featuredCollection: (collectionCards[0] ??
      null) as FeaturedCollection | null,
    collectionCards,
    trendingTokens: [] as TrendingToken[],
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
