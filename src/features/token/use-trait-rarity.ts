"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionSummaryOptions, traitFacetsOptions } from "@/lib/marketplace/public-queries";
import type { ApiCollection } from "@/lib/marketplace/types";

/** One entry of `GET /collections/{address}/traits`. Counts arrive as strings. */
export type TraitFacet = {
  name: string;
  kind?: string;
  values: Array<{ value: string | number | boolean; count: string | number }>;
};

export type TraitRarity = {
  /** Tokens in the collection carrying this value. */
  count: number;
  /** `count / tokenCount`, clamped to 0..1. */
  share: number;
};

export type TraitRarityLookup = (
  traitName: string,
  value: string,
) => TraitRarity | null;

export const TRAIT_RARITY_STALE_TIME_MS = 5 * 60_000;

function normalizeKey(value: unknown) {
  return String(value).trim().toLowerCase();
}

function parseCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** How many tokens share one trait value, or null when the facets cannot answer. */
export function traitShare(
  facets: TraitFacet[] | undefined,
  tokenCount: number | undefined,
  name: string,
  value: string,
): TraitRarity | null {
  if (!Array.isArray(facets)) return null;
  if (tokenCount === undefined || !Number.isFinite(tokenCount) || tokenCount <= 0)
    return null;

  const facet = facets.find((entry) => normalizeKey(entry?.name) === normalizeKey(name));
  if (!facet || !Array.isArray(facet.values)) return null;

  const match = facet.values.find(
    (entry) => normalizeKey(entry?.value) === normalizeKey(value),
  );
  const count = match ? parseCount(match.count) : null;
  if (count === null) return null;

  return { count, share: Math.min(1, count / tokenCount) };
}

function parseTokenCount(collection: ApiCollection | undefined) {
  const parsed = Number(collection?.tokenCount);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Collection-wide trait frequencies for the detail page. Facets and the
 * collection size are fetched once per collection and reused for 5 minutes.
 */
export function useTraitRarity(address: string): TraitRarityLookup {
  const facets = useQuery({ ...traitFacetsOptions(address), enabled: !!address });
  const collection = useQuery({ ...collectionSummaryOptions(address), enabled: !!address });

  const facetData = facets.data;
  const tokenCount = parseTokenCount(collection.data);

  return useCallback<TraitRarityLookup>(
    (traitName, value) => traitShare(facetData, tokenCount, traitName, value),
    [facetData, tokenCount],
  );
}
