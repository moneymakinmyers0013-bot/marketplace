"use client";

import { useQuery } from "@tanstack/react-query";
import { collectionTokensOptions } from "./public-queries";
import type {
  CollectionListingsOptions,
  CollectionOrdersOptions,
  CollectionSummaryOptions,
  FetchTokenBalancesOptions,
  FetchTokenBalancesResult,
  FetchCollectionTokensOptions,
  TokenDetails,
  TokenDetailsOptions,
} from "@/lib/marketplace/types";
import {
  useMarketplaceCollection,
  useMarketplaceCollectionListings,
  useMarketplaceCollectionOrders,
  useMarketplaceToken,
  useMarketplaceTokenBalances,
} from "@/lib/marketplace/react";
import {
  alternateTokenId,
  canonicalizeTokenId,
  expandTokenIdVariants,
} from "@/lib/marketplace/token-id";
import { normalizeMarketplaceAddress } from "@/lib/marketplace/address";
import type { TraitSelection } from "@/lib/marketplace/traits";
import { aggregateTraitValuePages } from "@/lib/marketplace/traits";
import { traitNamesSummaryQueryOptions } from "@/lib/marketplace/trait-summary-query";

function hasUsableToken(data: TokenDetails | null | undefined): data is TokenDetails {
  return data !== null && data !== undefined && data.token !== null && data.token !== undefined;
}

function collectionScopedTokenIdCandidates(collection: string, tokenId: string) {
  const normalizedCollection = normalizeMarketplaceAddress(collection);
  if (!normalizedCollection) {
    return [];
  }

  const candidates = new Set<string>();
  const alternate = alternateTokenId(tokenId);
  candidates.add(`${normalizedCollection}:${tokenId}`);
  if (alternate && alternate !== tokenId) {
    candidates.add(`${normalizedCollection}:${alternate}`);
  }

  return Array.from(candidates);
}

export function useCollectionQuery(options: CollectionSummaryOptions) {
  return useMarketplaceCollection(options, {
    enabled: !!options.address,
  });
}

export function useCollectionTokensQuery(
  options: FetchCollectionTokensOptions,
  queryOptions?: { enabled?: boolean; staleTime?: number },
) {
  const enabled = (queryOptions?.enabled ?? true) && !!options.address;
  return useQuery({
    ...collectionTokensOptions(options),
    enabled,
    staleTime: queryOptions?.staleTime ?? 15_000,
  });
}

export function useCollectionOrdersQuery(options: CollectionOrdersOptions) {
  return useMarketplaceCollectionOrders(options, {
    enabled: !!options.collection,
  });
}

export function useCollectionListingsQuery(options: CollectionListingsOptions) {
  return useMarketplaceCollectionListings(options, {
    enabled: !!options.collection,
  });
}

export function useTokenDetailQuery(options: TokenDetailsOptions) {
  const tokenId = String(options.tokenId);
  const enabled = !!options.collection && !!tokenId;
  const altTokenId = alternateTokenId(tokenId);
  const canonicalTokenId = canonicalizeTokenId(tokenId);
  const paddedTokenId = canonicalTokenId
    ? `0x${canonicalTokenId.value.toString(16).padStart(64, "0")}`
    : null;
  const hasAlternateTokenId = !!altTokenId && altTokenId !== tokenId;
  const hasPaddedTokenId =
    !!paddedTokenId &&
    paddedTokenId !== tokenId &&
    paddedTokenId !== altTokenId;
  const scopedTokenIdCandidates = collectionScopedTokenIdCandidates(
    options.collection,
    tokenId,
  );
  const scopedPrimaryTokenId = scopedTokenIdCandidates[0] ?? tokenId;
  const scopedSecondaryTokenId = scopedTokenIdCandidates[1] ?? scopedPrimaryTokenId;
  const hasScopedPrimaryTokenId = scopedPrimaryTokenId !== tokenId;
  const hasScopedSecondaryTokenId =
    scopedSecondaryTokenId !== scopedPrimaryTokenId &&
    scopedSecondaryTokenId !== tokenId &&
    scopedSecondaryTokenId !== altTokenId;

  const primaryQuery = useMarketplaceToken(options, {
    enabled,
  });

  const shouldEnableAlternateQuery =
    enabled
    && hasAlternateTokenId
    && primaryQuery.status !== "pending"
    && (primaryQuery.status === "error" || !hasUsableToken(primaryQuery.data));

  const alternateQuery = useMarketplaceToken(
    {
      ...options,
      tokenId: hasAlternateTokenId ? altTokenId : tokenId,
    },
    {
      enabled: shouldEnableAlternateQuery,
    },
  );

  const shouldEnablePaddedQuery =
    enabled &&
    hasPaddedTokenId &&
    primaryQuery.status !== "pending" &&
    (primaryQuery.status === "error" || !hasUsableToken(primaryQuery.data)) &&
    (!hasAlternateTokenId ||
      (alternateQuery.status !== "pending" &&
        (alternateQuery.status === "error" || !hasUsableToken(alternateQuery.data))));

  const paddedQuery = useMarketplaceToken(
    {
      ...options,
      tokenId: hasPaddedTokenId ? paddedTokenId : tokenId,
    },
    {
      enabled: shouldEnablePaddedQuery,
    },
  );

  const shouldEnableScopedPrimaryQuery =
    enabled &&
    hasScopedPrimaryTokenId &&
    primaryQuery.status !== "pending" &&
    (primaryQuery.status === "error" || !hasUsableToken(primaryQuery.data)) &&
    (!hasAlternateTokenId ||
      (alternateQuery.status !== "pending" &&
        (alternateQuery.status === "error" || !hasUsableToken(alternateQuery.data))));

  const scopedPrimaryQuery = useMarketplaceToken(
    {
      ...options,
      tokenId: scopedPrimaryTokenId,
    },
    {
      enabled: shouldEnableScopedPrimaryQuery,
    },
  );

  const shouldEnableScopedSecondaryQuery =
    shouldEnableScopedPrimaryQuery &&
    hasScopedSecondaryTokenId &&
    scopedPrimaryQuery.status !== "pending" &&
    (scopedPrimaryQuery.status === "error" || !hasUsableToken(scopedPrimaryQuery.data));

  const scopedSecondaryQuery = useMarketplaceToken(
    {
      ...options,
      tokenId: scopedSecondaryTokenId,
    },
    {
      enabled: shouldEnableScopedSecondaryQuery,
    },
  );

  if (hasUsableToken(primaryQuery.data)) {
    return primaryQuery;
  }

  if (shouldEnableAlternateQuery) {
    if (hasUsableToken(alternateQuery.data)) {
      return alternateQuery;
    }
  }

  if (shouldEnablePaddedQuery) {
    if (hasUsableToken(paddedQuery.data)) {
      return paddedQuery;
    }
  }

  if (shouldEnableScopedPrimaryQuery) {
    if (hasUsableToken(scopedPrimaryQuery.data)) {
      return scopedPrimaryQuery;
    }
  }

  if (shouldEnableScopedSecondaryQuery) {
    return scopedSecondaryQuery;
  }

  if (shouldEnableScopedPrimaryQuery) {
    return scopedPrimaryQuery;
  }

  if (shouldEnablePaddedQuery) {
    return paddedQuery;
  }

  if (shouldEnableAlternateQuery) {
    return alternateQuery;
  }

  return primaryQuery;
}

export function useTokenOwnershipQuery(options: {
  collection: string;
  tokenId: string;
  accountAddress?: string;
}) {
  const tokenIds = expandTokenIdVariants([options.tokenId]);
  return useMarketplaceTokenBalances(
    {
      contractAddresses: [options.collection],
      accountAddresses: options.accountAddress ? [options.accountAddress] : [],
      tokenIds,
      limit: 1,
    },
    {
      enabled: !!options.accountAddress && !!options.collection && !!options.tokenId,
    },
  );
}

export function useTraitNamesSummaryQuery(options: {
  address: string;
  projectId?: string;
}) {
  return useQuery({
    ...traitNamesSummaryQueryOptions(options),
    enabled: !!options.address,
  });
}

export function useTraitValuesQuery(options: {
  address: string;
  traitName: string | null;
  otherTraitFilters?: TraitSelection[];
  projectId?: string;
}) {
  return useQuery({
    queryKey: [
      "trait-values",
      options.address,
      options.traitName,
      options.otherTraitFilters,
      options.projectId,
    ] as const,
    queryFn: async () => {
      if (!options.traitName) return [];
      const { fetchTraitValues } = await import(
        "@/lib/marketplace/api-client"
      );
      const result = await fetchTraitValues({
        address: options.address,
        traitName: options.traitName,
        otherTraitFilters: options.otherTraitFilters,
        defaultProjectId: options.projectId,
      });
      return aggregateTraitValuePages(result.pages);
    },
    enabled: !!options.address && !!options.traitName,
  });
}

export function useTokenHolderQuery(options: {
  collection: string;
  tokenId: string;
}) {
  const tokenIds = expandTokenIdVariants([options.tokenId]);
  return useMarketplaceTokenBalances(
    {
      contractAddresses: [options.collection],
      tokenIds,
      limit: 1,
    },
    {
      enabled: !!options.collection && !!options.tokenId,
    },
  );
}

async function fetchAllTokenBalancePages(
  options: FetchTokenBalancesOptions,
): Promise<FetchTokenBalancesResult> {
  const { fetchTokenBalances } = await import("@/lib/marketplace/api-client");
  const balances: NonNullable<FetchTokenBalancesResult["page"]>["balances"] = [];
  let cursor = options.cursor ?? null;

  while (true) {
    const result = await fetchTokenBalances({
      ...options,
      cursor,
    });

    if (result.error || !result.page) {
      return result;
    }

    balances.push(...result.page.balances);

    if (!result.page.nextCursor) {
      return {
        page: {
          balances,
          nextCursor: null,
        },
        error: null,
      };
    }

    cursor = result.page.nextCursor;
  }
}

export function useWalletPortfolioQuery(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["wallet-portfolio", walletAddress] as const,
    queryFn: async () =>
      fetchAllTokenBalancePages({
        accountAddresses: walletAddress ? [walletAddress] : [],
        cursor: null,
        limit: 200,
      }),
    enabled: !!walletAddress,
    retry: false,
    staleTime: 60_000,
  });
}
