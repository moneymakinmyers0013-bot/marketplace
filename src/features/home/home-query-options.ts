import { queryOptions } from "@tanstack/react-query";
import { fetchCollectionTokens, marketplaceRequest } from "@/lib/marketplace/api-client";
import { publicQueryKey } from "@/lib/marketplace/public-query-key";
import type { ApiCollection, ApiPage } from "@/lib/marketplace/types";
import type { ActivityEvent } from "@/lib/marketplace/market-data";
import { formatRelativeTime } from "@/lib/marketplace/time-format";
import { tokenId as tokenKey } from "@/lib/marketplace/token-display";
import type { TrendingToken } from "./types";

function normalizeAddress(address: string) {
  try {
    return `0x${BigInt(address).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
}

/**
 * Orders indexed collections the way the marketplace is configured
 * (NEXT_PUBLIC_MARKETPLACE_COLLECTIONS), so the launch collection leads and
 * the rest keep a stable, deliberate order instead of the API's address sort.
 */
export function orderCollections<T extends { address: string }>(
  collections: T[],
  configured: Array<{ address: string }>,
): T[] {
  const rank = new Map(configured.map((entry, index) => [normalizeAddress(entry.address), index]));
  return [...collections].sort((a, b) => {
    const left = rank.get(normalizeAddress(a.address)) ?? Number.MAX_SAFE_INTEGER;
    const right = rank.get(normalizeAddress(b.address)) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

export function homeCollectionsOptions() {
  return queryOptions({ queryKey: publicQueryKey(["collections"]),
    queryFn: ({ signal }) => marketplaceRequest<ApiCollection[]>("/collections", {}, undefined, signal),
    staleTime: 30_000, retry: false,
  });
}

export function recentSalesOptions(address: string | null | undefined, limit = 8) {
  return queryOptions({ queryKey: publicQueryKey(["recent-sales", address, limit]),
    queryFn: async ({ signal }): Promise<TrendingToken[]> => {
      const page = await marketplaceRequest<ApiPage<ActivityEvent>>(`/collections/${address}/activity`, { type: "order_filled", limit }, undefined, signal);
      const sales = page.items.filter(event => event.tokenId);
      if (!sales.length) return [];
      const tokenIds = [...new Set(sales.map(event => String(event.tokenId)))];
      const tokens = await fetchCollectionTokens({ address: address!, tokenIds, limit: tokenIds.length }, signal);
      const byId = new Map(tokens.page.tokens.map(token => [tokenKey(token), token]));
      return sales.flatMap(sale => {
        const token = byId.get(String(sale.tokenId));
        return token ? [{ token, href: `/collections/${address}/${sale.tokenId}`, price: sale.buyerDebit ?? null, currency: sale.currency ?? null, note: `Sold ${formatRelativeTime(sale.provenance.timestamp)}` }] : [];
      });
    }, staleTime: 30_000, retry: false,
  });
}
