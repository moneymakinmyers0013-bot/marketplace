"use client";
import { useQuery } from "@tanstack/react-query";
import { collectionSummaryOptions, collectionListingsOptions, tokenDetailsOptions } from "./public-queries";
import { configureCurrencyDecimals } from "./amount-display";
import { useClientQuery } from "@biblio/marketplace-react";
import {getAppMarketplaceClient} from "./app-client";
import type { ReactNode } from "react";
import {
  fetchCollectionTokens,
  fetchTokenBalances,
  ownedClient,
  marketplaceRequest,
} from "./api-client";
import type {
  CollectionOrdersOptions,
  CollectionSummaryOptions,
  FetchCollectionTokensOptions,
  FetchTokenBalancesOptions,
  TokenDetailsOptions,
  MarketConfig,
} from "./types";
import { useMarketCurrency } from "./currency-store";
type Options = { enabled?: boolean; staleTime?: number };
export function MarketplaceClientProvider({
  children,
}: {
  children: ReactNode;
  config?: unknown;
}) {
  return children;
}
export function useMarketplaceCollection(
  o: CollectionSummaryOptions,
  q: Options = {},
) {
  return useQuery({
    ...collectionSummaryOptions(o.address),
    select: (c) => ({ ...c, metadata: { name: c.name, description: c.description, image: c.image }, totalSupply: c.tokenCount }),
    enabled: !!o.address && q.enabled !== false,
  });
}
export function useMarketplaceCollectionTokens(
  o: FetchCollectionTokensOptions,
  q: Options = {},
) {
  return useClientQuery(getAppMarketplaceClient(),{
    queryKey: ["owned", "tokens", o],
    queryFn: () => fetchCollectionTokens(o),
    enabled: !!o.address && q.enabled !== false,
    staleTime: q.staleTime,
  });
}
export function useMarketplaceCollectionListings(
  o: CollectionOrdersOptions,
  q: Options = {},
) {
  const currency = useMarketCurrency((s) => s.currency);
  const options = { ...o, currency: o.currency ?? currency };
  return useQuery({
    ...collectionListingsOptions(options),
    enabled: !!o.collection && q.enabled !== false,
  });
}
export function useMarketplaceCollectionOrders(
  o: CollectionOrdersOptions,
  q: Options = {},
) {
  return useClientQuery(getAppMarketplaceClient(),{
    queryKey: ["owned", "orders", o],
    queryFn: () => ownedClient.getCollectionOrders(o),
    enabled: !!o.collection && q.enabled !== false,
  });
}
export function useMarketplaceToken(o: TokenDetailsOptions, q: Options = {}) {
  return useQuery({
    ...tokenDetailsOptions(o),
    enabled: !!o.collection && q.enabled !== false,
  });
}
export function useMarketplaceTokenBalances(
  o: FetchTokenBalancesOptions,
  q: Options = {},
) {
  return useClientQuery(getAppMarketplaceClient(),{
    queryKey: ["owned", "balances", o],
    queryFn: () => fetchTokenBalances(o),
    enabled: q.enabled !== false,
  });
}
export function useMarketConfig() {
  return useClientQuery(getAppMarketplaceClient(),{
    queryKey: ["owned", "config"],
    queryFn: async () => {
      const config = await marketplaceRequest<MarketConfig>(
        "/marketplace/config",
      );
      configureCurrencyDecimals(config.currencies);
      return config;
    },
    refetchInterval: 10000,
  });
}
export function useMarketplaceClient() {
  const query = useMarketConfig();
  return {
    client: ownedClient,
    status: query.isError
      ? ("error" as const)
      : query.isPending
        ? ("loading" as const)
        : ("ready" as const),
    error: query.error,
    refresh: query.refetch,
  };
}
