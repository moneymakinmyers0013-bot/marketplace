"use client";
import { useQuery, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { collectionSummaryOptions, collectionStatsOptions, topOfferOptions, listingsDepthOptions, collectionOffersOptions, collectionActivityOptions } from "./public-queries";

/** Shape returned by `GET /collections/{address}/stats`. Amounts are base-unit strings. */
export type CollectionStats = {
  venue?: string;
  days: number;
  periodStart?: number;
  periodEnd?: number;
  periodBasis?: string;
  byCurrency: Array<{
    currency: string;
    volume: string;
    sales: number;
    history: Array<{ timestamp: number; price: string; tokenId?: string }>;
  }>;
  floors: Array<{ currency: string; symbol?: string; price: string }>;
  floorHistory?: Array<{
    collection?: string;
    currency: string;
    price: string | null;
    timestamp: number;
    block?: number;
  }>;
  historyLimit?: number;
};

export type ActivityEvent = {
  id: string;
  type: string;
  kind?: "listing" | "token_offer" | "collection_offer";
  collection?: string;
  tokenId?: string | null;
  currency?: string;
  buyerDebit?: string;
  sellerProceeds?: string;
  maker?: string;
  buyer?: string;
  seller?: string;
  from?: string;
  to?: string;
  expiry?: string;
  provenance: {
    blockNumber?: number;
    blockHash?: string;
    transactionHash?: string;
    eventIndex?: number;
    timestamp: number;
  };
};

export type ActivityFilter = "all" | "sales" | "listings" | "offers" | "transfers";

export const STATS_PERIODS = [1, 7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export function useCollectionStatsQuery(address: string, days: number, currency?: string, options: { enabled?: boolean } = {}) {
  return useQuery({ ...collectionStatsOptions(address, days, currency), enabled: !!address && options.enabled !== false, placeholderData: keepPreviousData });
}
export function useCollectionSummaryQuery(address: string) {
  return useQuery({ ...collectionSummaryOptions(address), enabled: !!address });
}
export function useCollectionOffersQuery(address: string, options: { currency?: string; tokenMatch?: string; limit?: number; enabled?: boolean } = {}) {
  return useInfiniteQuery({ ...collectionOffersOptions(address, options), enabled: !!address && options.enabled !== false });
}
export function useTopOfferQuery(address: string, currency: string | undefined) {
  return useQuery({ ...topOfferOptions(address, currency), enabled: !!address && !!currency });
}
export function useCollectionListingsPageQuery(address: string, currency: string | undefined, limit = 100) {
  return useQuery({ ...listingsDepthOptions(address, currency, limit), enabled: !!address && !!currency });
}
export function useCollectionActivityQuery(address: string, filter: ActivityFilter, options: { limit?: number; enabled?: boolean } = {}) {
  return useInfiniteQuery({ ...collectionActivityOptions(address, filter, options.limit), enabled: !!address && options.enabled !== false });
}

const DISPLAY_TYPES = new Set(["order_filled", "order_created", "order_cancelled", "transfer"]);

/** Keep only trading and ownership events; policy and admin noise is dropped. Listings and offers share a type, so refine by kind. */
export function filterActivityEvents(events: ActivityEvent[], filter: ActivityFilter) {
  return events.filter((event) => {
    if (!DISPLAY_TYPES.has(event.type)) return false;
    if (filter === "listings") return event.type === "order_created" && event.kind === "listing";
    if (filter === "offers") return event.type === "order_created" && event.kind !== "listing";
    return true;
  });
}
