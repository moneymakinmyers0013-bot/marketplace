import type { QueryClient } from "@tanstack/react-query";
import { collectionDiscoveryStateFromSearchParams } from "@/features/collections/collection-query-params";
import { apiFiltersFromActiveFilters } from "./browse-filters";
import { DEFAULT_CURRENCY } from "@/lib/marketplace/api-client";
import { collectionActivityOptions, collectionListingsOptions, collectionOffersOptions, collectionStatsOptions, collectionSummaryOptions, collectionTokensOptions, listingsDepthOptions, topOfferOptions } from "./public-queries";
import { traitNamesSummaryQueryOptions } from "./trait-summary-query";
import { COLLECTION_LISTING_SAMPLE_LIMIT } from "./query-limits";
import type { FetchCollectionTokensOptions } from "./types";

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
