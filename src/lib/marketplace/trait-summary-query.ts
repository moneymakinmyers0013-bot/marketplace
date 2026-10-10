import { publicQueryKey } from "./public-query-key";
import { queryOptions } from "@tanstack/react-query";
import {
  aggregateTraitSummaryPages,
  type TraitNameSummary,
} from "@/lib/marketplace/traits";

export const TRAIT_SUMMARY_STALE_TIME_MS = 60_000;

export type TraitNamesSummaryQueryInput = {
  address: string;
  projectId?: string;
};

export function traitNamesSummaryQueryKey(options: TraitNamesSummaryQueryInput) {
  return publicQueryKey(["trait-names-summary", options.address, options.projectId]);
}

export async function fetchTraitNamesSummaryAggregate(
  options: TraitNamesSummaryQueryInput,
  signal?: AbortSignal,
): Promise<TraitNameSummary[]> {
  const { fetchTraitNamesSummary } = await import("@/lib/marketplace/api-client");
  const input = { address: options.address, defaultProjectId: options.projectId };
  const result = await (signal ? fetchTraitNamesSummary(input, signal) : fetchTraitNamesSummary(input));

  return aggregateTraitSummaryPages(result.pages);
}

export function traitNamesSummaryQueryOptions(options: TraitNamesSummaryQueryInput) {
  return queryOptions({
    queryKey: traitNamesSummaryQueryKey(options),
    queryFn: ({ signal }) => fetchTraitNamesSummaryAggregate(options, signal),
    retry: false,
    staleTime: TRAIT_SUMMARY_STALE_TIME_MS,
  });
}
