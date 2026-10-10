import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { CollectionOrdersOptions } from "@/lib/marketplace/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseMarketplaceCollection,
  mockUseMarketplaceCollectionTokens,
  mockUseMarketplaceCollectionOrders,
  mockUseMarketplaceCollectionListings,
  mockUseMarketplaceToken,
  mockUseMarketplaceTokenBalances,
  mockGetMarketplaceRuntimeConfig,
} = vi.hoisted(() => ({
  mockUseMarketplaceCollection: vi.fn(),
  mockUseMarketplaceCollectionTokens: vi.fn(),
  mockUseMarketplaceCollectionOrders: vi.fn(),
  mockUseMarketplaceCollectionListings: vi.fn(),
  mockUseMarketplaceToken: vi.fn(),
  mockUseMarketplaceTokenBalances: vi.fn(),
  mockGetMarketplaceRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/marketplace/react", () => ({
  useMarketplaceCollection: mockUseMarketplaceCollection,
  useMarketplaceCollectionTokens: mockUseMarketplaceCollectionTokens,
  useMarketplaceCollectionOrders: mockUseMarketplaceCollectionOrders,
  useMarketplaceCollectionListings: mockUseMarketplaceCollectionListings,
  useMarketplaceToken: mockUseMarketplaceToken,
  useMarketplaceTokenBalances: mockUseMarketplaceTokenBalances,
}));

vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: mockGetMarketplaceRuntimeConfig,
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  QueryWrapper.displayName = "QueryWrapper";
  return QueryWrapper;
}

describe("marketplace hooks", () => {
  beforeEach(() => {
    mockUseMarketplaceCollection.mockReset();
    mockUseMarketplaceCollectionTokens.mockReset();
    mockUseMarketplaceCollectionOrders.mockReset();
    mockUseMarketplaceCollectionListings.mockReset();
    mockUseMarketplaceToken.mockReset();
    mockUseMarketplaceTokenBalances.mockReset();
    mockGetMarketplaceRuntimeConfig.mockReset();
    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      collections: [],
    });
    vi.unstubAllGlobals();
  });

  it("useCollectionQuery_delegates_to_sdk_hook", async () => {
    const expected = { status: "success", data: { address: "0xabc" } };
    mockUseMarketplaceCollection.mockReturnValue(expected);

    const { useCollectionQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useCollectionQuery({ address: "0xabc", fetchImages: true }),
    );

    expect(mockUseMarketplaceCollection).toHaveBeenCalledWith(
      { address: "0xabc", fetchImages: true },
      { enabled: true },
    );
    expect(result.current).toBe(expected);
  });

  it("useCollectionTokensQuery_calls_fetchCollectionTokens", async () => {
    const pageData = { page: { tokens: [], nextCursor: null }, error: null };
    const mockFetchCollectionTokens = vi.fn().mockResolvedValue(pageData);

    vi.doMock("@/lib/marketplace/api-client", () => ({
      fetchCollectionTokens: mockFetchCollectionTokens,
    }));

    const { useCollectionTokensQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useCollectionTokensQuery({ address: "0xabc", limit: 12, fetchImages: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchCollectionTokens).toHaveBeenCalledWith(
      expect.objectContaining({ address: "0xabc", limit: 12, fetchImages: true }),
      expect.any(AbortSignal),
    );
    expect(result.current.data).toBe(pageData);
  });

  it("useCollectionOrdersQuery_delegates_to_sdk_hook", async () => {
    const expected = { status: "success", data: [] };
    mockUseMarketplaceCollectionOrders.mockReturnValue(expected);

    const { useCollectionOrdersQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () =>
        useCollectionOrdersQuery({
          collection: "0xabc",
          status: "Placed" as CollectionOrdersOptions["status"],
        }),
    );

    expect(mockUseMarketplaceCollectionOrders).toHaveBeenCalledWith(
      { collection: "0xabc", status: "Placed" },
      { enabled: true },
    );
    expect(result.current).toBe(expected);
  });

  it("useCollectionListingsQuery_delegates_to_sdk_hook", async () => {
    const expected = { status: "success", data: [] };
    mockUseMarketplaceCollectionListings.mockReturnValue(expected);

    const { useCollectionListingsQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useCollectionListingsQuery({ collection: "0xabc", projectId: "project-a" }),
    );

    expect(mockUseMarketplaceCollectionListings).toHaveBeenCalledWith(
      { collection: "0xabc", projectId: "project-a" },
      { enabled: true },
    );
    expect(result.current).toBe(expected);
  });

  it("useTokenDetailQuery_delegates_to_sdk_hook", async () => {
    const expected = { status: "success", data: { token: { token_id: "42" } } };
    mockUseMarketplaceToken.mockReturnValue(expected);

    const { useTokenDetailQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useTokenDetailQuery({ collection: "0xabc", tokenId: "42", fetchImages: true }),
    );

    expect(mockUseMarketplaceToken).toHaveBeenNthCalledWith(
      1,
      { collection: "0xabc", tokenId: "42", fetchImages: true },
      { enabled: true },
    );
    expect(mockUseMarketplaceToken).toHaveBeenNthCalledWith(
      2,
      { collection: "0xabc", tokenId: "0x2a", fetchImages: true },
      { enabled: false },
    );
    expect(result.current).toBe(expected);
  });

  it("useTokenDetailQuery_uses_alternate_token_id_when_primary_has_no_token", async () => {
    const fallbackResult = {
      status: "success",
      data: { token: { token_id: "0x935", metadata: { name: "Loot Chest #2357" } } },
    };
    mockUseMarketplaceToken.mockImplementation((options: { tokenId: string }) => {
      if (options.tokenId === "2357") {
        return { status: "success", data: null };
      }
      if (options.tokenId === "0x935") {
        return fallbackResult;
      }
      return { status: "pending", data: null };
    });

    const { useTokenDetailQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useTokenDetailQuery({ collection: "0xloot", tokenId: "2357", fetchImages: true }),
    );

    expect(mockUseMarketplaceToken).toHaveBeenNthCalledWith(
      1,
      { collection: "0xloot", tokenId: "2357", fetchImages: true },
      { enabled: true },
    );
    expect(mockUseMarketplaceToken).toHaveBeenNthCalledWith(
      2,
      { collection: "0xloot", tokenId: "0x935", fetchImages: true },
      { enabled: true },
    );
    expect(result.current).toBe(fallbackResult);
  });

  it("useTokenDetailQuery_uses_scoped_token_id_when_unscoped_lookup_fails", async () => {
    const scopedResult = {
      status: "success",
      data: { token: { token_id: "1", metadata: { name: "Token #1" } } },
    };

    mockUseMarketplaceToken.mockImplementation((options: { tokenId: string }) => {
      if (options.tokenId === "1") {
        return { status: "success", data: null };
      }
      if (options.tokenId === "0x1") {
        return { status: "success", data: null };
      }
      if (options.tokenId === "0xabc:1") {
        return scopedResult;
      }
      if (options.tokenId === "0xabc:0x1") {
        return { status: "success", data: null };
      }
      return { status: "pending", data: null };
    });

    const { useTokenDetailQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useTokenDetailQuery({ collection: "0xabc", tokenId: "1", fetchImages: true }),
    );

    expect(mockUseMarketplaceToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: "0xabc:1" }),
      expect.objectContaining({ enabled: true }),
    );
    expect(result.current).toBe(scopedResult);
  });

  it("useTokenDetailQuery_uses_padded_hex_token_id_when_basic_variants_fail", async () => {
    const paddedTokenId = "0x000000000000000000000000000000000000000000000000000000000000025e";
    const paddedResult = {
      status: "success",
      data: { token: { token_id: paddedTokenId, metadata: { name: "Token #606" } } },
    };

    mockUseMarketplaceToken.mockImplementation((options: { tokenId: string }) => {
      if (options.tokenId === "606") {
        return { status: "success", data: null };
      }
      if (options.tokenId === "0x25e") {
        return { status: "success", data: null };
      }
      if (options.tokenId === paddedTokenId) {
        return paddedResult;
      }
      return { status: "pending", data: null };
    });

    const { useTokenDetailQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(
      () => useTokenDetailQuery({ collection: "0xabc", tokenId: "606", fetchImages: true }),
    );

    expect(mockUseMarketplaceToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: paddedTokenId }),
      expect.objectContaining({ enabled: true }),
    );
    expect(result.current).toBe(paddedResult);
  });

  it("useTokenOwnershipQuery_passes_alt_token_ids", async () => {
    mockUseMarketplaceTokenBalances.mockReturnValue({ status: "success", data: { page: { balances: [] } } });

    const { useTokenOwnershipQuery } = await import("@/lib/marketplace/hooks");
    renderHook(
      () => useTokenOwnershipQuery({ collection: "0xcol", tokenId: "2648", accountAddress: "0xabc" }),
    );

    expect(mockUseMarketplaceTokenBalances).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddresses: ["0xcol"],
        accountAddresses: ["0xabc"],
        tokenIds: expect.arrayContaining(["2648", "0xa58"]),
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("useTokenHolderQuery_passes_alt_token_ids", async () => {
    mockUseMarketplaceTokenBalances.mockReturnValue({ status: "success", data: { page: { balances: [] } } });

    const { useTokenHolderQuery } = await import("@/lib/marketplace/hooks");
    renderHook(
      () => useTokenHolderQuery({ collection: "0xcol", tokenId: "0xa58" }),
    );

    expect(mockUseMarketplaceTokenBalances).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddresses: ["0xcol"],
        tokenIds: expect.arrayContaining(["0xa58", "2648"]),
      }),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("useWalletPortfolioQuery_fetches_all_balance_pages", async () => {
    const mockFetchTokenBalances = vi
      .fn()
      .mockResolvedValueOnce({
        page: {
          balances: [{ contract_address: "0xcol1", token_id: "1", balance: "1" }],
          nextCursor: "cursor-2",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        page: {
          balances: [{ contract_address: "0xcol2", token_id: "2", balance: "1" }],
          nextCursor: null,
        },
        error: null,
      });

    vi.doMock("@/lib/marketplace/api-client", () => ({
      fetchTokenBalances: mockFetchTokenBalances,
    }));

    const { useWalletPortfolioQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(() => useWalletPortfolioQuery("0xwallet"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetchTokenBalances).toHaveBeenNthCalledWith(1, {
      accountAddresses: ["0xwallet"],
      cursor: null,
      limit: 200,
    });
    expect(mockFetchTokenBalances).toHaveBeenNthCalledWith(2, {
      accountAddresses: ["0xwallet"],
      cursor: "cursor-2",
      limit: 200,
    });
    expect(result.current.data).toEqual({
      page: {
        balances: [
          { contract_address: "0xcol1", token_id: "1", balance: "1" },
          { contract_address: "0xcol2", token_id: "2", balance: "1" },
        ],
        nextCursor: null,
      },
      error: null,
    });
  });

  it("useWalletPortfolioQuery_does_not_scope_balances_to_configured_marketplace_collections", async () => {
    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      collections: [
        { address: "0xcol1", name: "Collection One" },
        { address: "0xcol2", name: "Collection Two" },
      ],
    });

    const mockFetchTokenBalances = vi.fn().mockResolvedValue({
      page: {
        balances: [],
        nextCursor: null,
      },
      error: null,
    });

    vi.doMock("@/lib/marketplace/api-client", () => ({
      fetchTokenBalances: mockFetchTokenBalances,
    }));

    const { useWalletPortfolioQuery } = await import("@/lib/marketplace/hooks");
    const { result } = renderHook(() => useWalletPortfolioQuery("0xwallet"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetchTokenBalances).toHaveBeenCalledWith({
      accountAddresses: ["0xwallet"],
      cursor: null,
      limit: 200,
    });
  });

  describe("useTraitNamesSummaryQuery", () => {
    it("fetches_and_aggregates_trait_names_via_sdk", async () => {
      const mockFetchTraitNamesSummary = vi.fn().mockResolvedValue({
        pages: [
          {
            projectId: "project-a",
            traits: [
              { traitName: "Background", valueCount: 2 },
              { traitName: "Eyes", valueCount: 3 },
            ],
          },
        ],
        errors: [],
      });

      vi.doMock("@/lib/marketplace/api-client", () => ({
        fetchTraitNamesSummary: mockFetchTraitNamesSummary,
      }));

      const { useTraitNamesSummaryQuery } = await import("@/lib/marketplace/hooks");
      const { result } = renderHook(
        () => useTraitNamesSummaryQuery({ address: "0xabc", projectId: "project-a" }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetchTraitNamesSummary).toHaveBeenCalledWith(
        expect.objectContaining({ address: "0xabc", defaultProjectId: "project-a" }),
        expect.any(AbortSignal),
      );
      expect(result.current.data).toEqual([
        { traitName: "Background", valueCount: 2 },
        { traitName: "Eyes", valueCount: 3 },
      ]);
    });

    it("disabled_when_address_is_empty", async () => {
      const { useTraitNamesSummaryQuery } = await import("@/lib/marketplace/hooks");
      const { result } = renderHook(
        () => useTraitNamesSummaryQuery({ address: "" }),
        { wrapper: makeWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
    });
  });

  describe("useTraitValuesQuery", () => {
    it("fetches_values_when_trait_name_provided", async () => {
      const mockFetchTraitValues = vi.fn().mockResolvedValue({
        pages: [
          {
            projectId: "project-a",
            values: [
              { traitValue: "Blue", count: 5 },
              { traitValue: "Red", count: 3 },
            ],
          },
        ],
        errors: [],
      });

      vi.doMock("@/lib/marketplace/api-client", () => ({
        fetchTraitValues: mockFetchTraitValues,
      }));

      const { useTraitValuesQuery } = await import("@/lib/marketplace/hooks");
      const { result } = renderHook(
        () => useTraitValuesQuery({ address: "0xabc", traitName: "Background", projectId: "project-a" }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetchTraitValues).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0xabc",
          traitName: "Background",
          defaultProjectId: "project-a",
        }),
      );
      expect(result.current.data).toEqual([
        { traitValue: "Blue", count: 5 },
        { traitValue: "Red", count: 3 },
      ]);
    });

    it("disabled_when_trait_name_is_null", async () => {
      const { useTraitValuesQuery } = await import("@/lib/marketplace/hooks");
      const { result } = renderHook(
        () => useTraitValuesQuery({ address: "0xabc", traitName: null }),
        { wrapper: makeWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
    });

    it("forwards_other_trait_filters_to_sdk", async () => {
      const mockFetchTraitValues = vi.fn().mockResolvedValue({
        pages: [{ projectId: "project-a", values: [{ traitValue: "Big", count: 2 }] }],
        errors: [],
      });

      vi.doMock("@/lib/marketplace/api-client", () => ({
        fetchTraitValues: mockFetchTraitValues,
      }));

      const { useTraitValuesQuery } = await import("@/lib/marketplace/hooks");
      const { result } = renderHook(
        () =>
          useTraitValuesQuery({
            address: "0xabc",
            traitName: "Eyes",
            otherTraitFilters: [{ name: "Background", value: "Blue" }],
            projectId: "project-a",
          }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetchTraitValues).toHaveBeenCalledWith(
        expect.objectContaining({
          otherTraitFilters: [{ name: "Background", value: "Blue" }],
        }),
      );
    });
  });
});
