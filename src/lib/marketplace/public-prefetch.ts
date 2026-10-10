import type { QueryClient } from "@tanstack/react-query";
import { collectionDiscoveryStateFromSearchParams } from "@/features/collections/collection-query-params";
import { apiFiltersFromActiveFilters } from "./browse-filters";
import { DEFAULT_CURRENCY } from "@/lib/marketplace/api-client";
import { collectionActivityOptions, collectionListingsOptions, collectionOffersOptions, collectionStatsOptions, collectionSummaryOptions, collectionTokensOptions, listingsDepthOptions, topOfferOptions } from "./public-queries";
import { traitNamesSummaryQueryOptions } from "./trait-summary-query";
import { COLLECTION_LISTING_SAMPLE_LIMIT } from "./query-limits";
import type { FetchCollectionTokensOptions } from "./types";
import { getMarketplaceRuntimeConfig } from "./config";
import { homeCollectionsOptions, orderCollections, recentSalesOptions } from "@/features/home/home-query-options";
import { tokenActivityOptions, tokenDetailsOptions, traitFacetsOptions } from "./public-queries";

export type CollectionPageRead = { address: string; params: URLSearchParams; currency?: string; projectId?: string };

export function collectionPageTokenOptions({ address, params, currency = DEFAULT_CURRENCY, projectId }: CollectionPageRead): FetchCollectionTokensOptions {
  const discovery = collectionDiscoveryStateFromSearchParams(params);
  return { address, project: projectId, currency, limit: 24,
    cursor: params.get("cursor") || undefined, sort: discovery.sortMode,
    q: discovery.query || undefined, listedOnly: discovery.listedOnly,
    filters: apiFiltersFromActiveFilters(discovery.activeFilters),
  };
}

/** Shared by server delivery and bounded navigation prefetch; only public reads. */
export async function prefetchCollectionPage(client: QueryClient, input: CollectionPageRead) {
  const { address, projectId, currency = DEFAULT_CURRENCY, params } = input;
  const { tab } = collectionDiscoveryStateFromSearchParams(params);
  const work = [
    client.prefetchQuery(collectionSummaryOptions(address)),
    client.prefetchQuery(collectionStatsOptions(address, 7, currency)),
    client.prefetchQuery(topOfferOptions(address, currency)),
  ];
  if (tab === "items") work.push(
    client.prefetchQuery(traitNamesSummaryQueryOptions({ address, projectId })),
    client.prefetchQuery(collectionTokensOptions(collectionPageTokenOptions(input))),
    client.prefetchQuery(collectionListingsOptions({ collection: address, currency, limit: COLLECTION_LISTING_SAMPLE_LIMIT })),
  );
  if (tab === "offers") work.push(client.prefetchInfiniteQuery(collectionOffersOptions(address, { currency })));
  if (tab === "activity") work.push(client.prefetchInfiniteQuery(collectionActivityOptions(address, "all")));
  if (tab === "analytics") work.push(client.prefetchQuery(listingsDepthOptions(address, currency)));
  await Promise.all(work);
}

export async function prefetchHomePage(client: QueryClient, currency = DEFAULT_CURRENCY) {
  await client.prefetchQuery(homeCollectionsOptions());
  return prefetchHomeSections(client, currency);
}

export async function prefetchHomeSections(client: QueryClient, currency = DEFAULT_CURRENCY) {
  const collections = client.getQueryData(homeCollectionsOptions().queryKey);
  if (!collections?.length) return;
  const featured = orderCollections(collections, getMarketplaceRuntimeConfig().collections)[0];
  await Promise.all([
    client.prefetchQuery(recentSalesOptions(featured.address)),
    ...collections.map(collection => client.prefetchQuery(collectionStatsOptions(collection.address, 7, currency))),
  ]);
}

export async function prefetchTokenPage(client: QueryClient, { address, tokenId, currency = DEFAULT_CURRENCY }: { address: string; tokenId: string; currency?: string }) {
  await Promise.all([
    client.prefetchQuery(tokenDetailsOptions({ collection: address, tokenId })),
    client.prefetchQuery(collectionSummaryOptions(address)),
    client.prefetchQuery(collectionListingsOptions({ collection: address, tokenId, currency })),
    client.prefetchQuery(traitFacetsOptions(address)),
    client.prefetchInfiniteQuery(collectionOffersOptions(address, { tokenMatch: tokenId, limit: 50 })),
    client.prefetchInfiniteQuery(tokenActivityOptions(address, tokenId)),
  ]);
}
