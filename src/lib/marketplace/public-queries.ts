import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { DEFAULT_CURRENCY, marketplaceRequest, ownedClient } from "@/lib/marketplace/api-client";
import type { ApiCollection, ApiOrder, ApiPage, CollectionOrdersOptions, FetchCollectionTokensOptions, TokenDetailsOptions } from "./types";
import type { ActivityEvent, ActivityFilter, CollectionStats } from "./market-data";
import { publicQueryKey } from "./public-query-key";
import type { TokenActivityItem } from "@/features/token/token-activity";
import type { TraitFacet } from "@/features/token/use-trait-rarity";

// Public browse snapshots only. Trading still revalidates current terms and policy.
const readOptions = { staleTime: 15_000, retry: false as const };
export function collectionSummaryOptions(address: string) {
  return queryOptions({ ...readOptions, staleTime: 30_000,
    queryKey: publicQueryKey(["collection-summary", address]),
    queryFn: ({ signal }) => marketplaceRequest<ApiCollection>(`/collections/${address}`, {}, undefined, signal),
  });
}
export function collectionTokensOptions(options: FetchCollectionTokensOptions) {
  const { address, cursor, tokenIds, attributeFilters, filters, limit = 24, sort = "token-asc", currency = DEFAULT_CURRENCY, q, listedOnly = false } = options;
  return queryOptions({ ...readOptions,
    queryKey: publicQueryKey(["tokens", address, { cursor, tokenIds, attributeFilters: filters ? undefined : attributeFilters, filters, limit, sort, currency, q: q?.trim() || undefined, listedOnly }]),
    queryFn: async ({ signal }) => (await import("@/lib/marketplace/api-client")).fetchCollectionTokens(options, signal),
  });
}
export function collectionListingsOptions(options: CollectionOrdersOptions) {
  const { collection, tokenId, limit = 100, cursor, currency = DEFAULT_CURRENCY } = options;
  return queryOptions({ ...readOptions,
    queryKey: publicQueryKey(["listings", collection, { tokenId, limit, cursor, currency }]),
    queryFn: ({ signal }) => ownedClient.listCollectionListings(options, signal),
  });
}
export function tokenDetailsOptions(options: TokenDetailsOptions) {
  return queryOptions({ ...readOptions,
    queryKey: publicQueryKey(["token", options.collection, options.tokenId]),
    queryFn: ({ signal }) => ownedClient.getToken(options, signal),
  });
}
export function collectionStatsOptions(address: string, days: number, currency?: string) {
  return queryOptions({ ...readOptions, staleTime: 30_000,
    queryKey: publicQueryKey(["stats", address, days, currency ?? "all"]),
    queryFn: ({ signal }) => marketplaceRequest<CollectionStats>(`/collections/${address}/stats`, { days, currency }, undefined, signal),
  });
}
export function topOfferOptions(address: string, currency?: string) {
  return queryOptions({ ...readOptions,
    queryKey: publicQueryKey(["top-offer", address, currency ?? "none"]),
    queryFn: async ({ signal }) => (await marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/offers`, { state: "open", currency, limit: 1 }, undefined, signal)).items[0] ?? null,
  });
}
export function listingsDepthOptions(address: string, currency?: string, limit = 100) {
  return queryOptions({ ...readOptions,
    queryKey: publicQueryKey(["listings-depth", address, currency ?? "none", limit]),
    queryFn: ({ signal }) => marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/listings`, { currency, limit }, undefined, signal),
  });
}
export function collectionOffersOptions(address: string, options: { currency?: string; tokenMatch?: string; limit?: number } = {}) {
  const { currency, tokenMatch, limit = 25 } = options;
  return infiniteQueryOptions({ ...readOptions,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ApiPage<ApiOrder>) => page.nextCursor ?? undefined,
    queryKey: publicQueryKey(["collection-offers", address, currency ?? "all", tokenMatch ?? "", limit]),
    queryFn: ({ pageParam, signal }) => marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/offers`, { state: "open", currency, tokenMatch, limit, cursor: pageParam }, undefined, signal),
  });
}
export function collectionActivityOptions(address: string, filter: ActivityFilter, limit = 30) {
  const type = filter === "all" ? undefined : filter === "sales" ? "order_filled" : filter === "transfers" ? "transfer" : "order_created";
  return infiniteQueryOptions({ ...readOptions,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ApiPage<ActivityEvent>) => page.nextCursor ?? undefined,
    queryKey: publicQueryKey(["collection-activity", address, filter, limit]),
    queryFn: ({ pageParam, signal }) => marketplaceRequest<ApiPage<ActivityEvent>>(`/collections/${address}/activity`, { type, limit, cursor: pageParam }, undefined, signal),
  });
}

export function tokenActivityOptions(address: string, tokenId: string) {
  return infiniteQueryOptions({ ...readOptions,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ApiPage<TokenActivityItem>) => page.nextCursor ?? undefined,
    queryKey: publicQueryKey(["token-activity", address, tokenId]),
    queryFn: ({ pageParam, signal }) => marketplaceRequest<ApiPage<TokenActivityItem>>(`/tokens/${address}/${tokenId}/activity`, { limit: 20, cursor: pageParam }, undefined, signal),
  });
}
export function traitFacetsOptions(address: string) {
  return queryOptions({ ...readOptions, staleTime: 5 * 60_000,
    queryKey: publicQueryKey(["trait-facets", address]),
    queryFn: ({ signal }) => marketplaceRequest<TraitFacet[]>(`/collections/${address}/traits`, {}, undefined, signal),
  });
}
