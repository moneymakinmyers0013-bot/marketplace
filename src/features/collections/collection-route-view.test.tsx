import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionRouteView } from "@/features/collections/collection-route-view";
import type { SeedCollection } from "@/lib/marketplace/config";

const { mockUseCollectionQuery, mockUseTraitNamesSummaryQuery, mockUseTraitValuesQuery, mockUseCollectionListingsQuery } = vi.hoisted(() => ({
  mockUseCollectionQuery: vi.fn(),
  mockUseTraitNamesSummaryQuery: vi.fn(),
  mockUseTraitValuesQuery: vi.fn(),
  mockUseCollectionListingsQuery: vi.fn(),
}));
const {
  mockCartAddCandidates,
  mockCartSetOpen,
  setMockCartItems,
  getMockCartItems,
  setMockVisibleTokens,
  getMockVisibleTokens,
  mockSweepBarRender,
  mockTokenGridRender,
} = vi.hoisted(() => {
  let mockCartItems: Array<Record<string, unknown>> = [];
  let mockVisibleTokens: Array<Record<string, unknown>> = [];

  return {
    mockCartAddCandidates: vi.fn(),
    mockCartSetOpen: vi.fn(),
    setMockCartItems: (items: Array<Record<string, unknown>>) => {
      mockCartItems = items;
    },
    getMockCartItems: () => mockCartItems,
    setMockVisibleTokens: (tokens: Array<Record<string, unknown>>) => {
      mockVisibleTokens = tokens;
    },
    getMockVisibleTokens: () => mockVisibleTokens,
    mockSweepBarRender: vi.fn(),
    mockTokenGridRender: vi.fn(),
  };
});

vi.mock("./use-sweep-candidates",()=>({useSweepCandidates:()=>({data:(mockUseCollectionListingsQuery()?.data??[]).map((o:Record<string,unknown>)=>({orderId:String(o.id),collection:"0xabc",tokenId:String(o.tokenId),price:String(o.price),currency:String(o.currency),quantity:"1"})).sort((a:{price:string},b:{price:string})=>Number(BigInt(a.price)-BigInt(b.price)))})}));

const mockUseCollectionTokensQuery = vi.fn();

vi.mock("@/lib/marketplace/hooks", () => ({
  useCollectionQuery: mockUseCollectionQuery,
  useTraitNamesSummaryQuery: mockUseTraitNamesSummaryQuery,
  useTraitValuesQuery: mockUseTraitValuesQuery,
  useCollectionListingsQuery: mockUseCollectionListingsQuery,
  useCollectionTokensQuery: (...args: unknown[]) => mockUseCollectionTokensQuery(...args),
}));

vi.mock("@/features/collections/collection-token-grid", () => ({
  CollectionTokenGrid: (props: Record<string, unknown>) => {
    mockTokenGridRender(props);
    return (
      <div data-testid="collection-token-grid">
        <div data-testid="collection-toolbar-slot">{props.toolbar as ReactNode}</div>
        Token Grid: {props.address as string} | Sort: {String(props.sortMode ?? "recent")} | Layout: {String(props.layout)} | Query: {String(props.query ?? "")} | Listed: {String(props.listedOnly)}
        <div data-testid="token-grid-sweep-preview">
          {Array.from((props.sweepPreviewTokenIds as Set<string> | undefined) ?? []).join(",")}
        </div>
        <button
          onClick={() =>
            (props.onTokensChange as ((tokens: Array<Record<string, unknown>>) => void) | undefined)?.(getMockVisibleTokens())
          }
          type="button"
        >
          Emit visible tokens
        </button>
      </div>
    );
  },
}));

vi.mock("@/features/collections/collection-activity-feed", () => ({
  CollectionActivityFeed: (props: Record<string, unknown>) => (
    <div data-testid="collection-activity-feed">Activity: {props.address as string}</div>
  ),
}));
vi.mock("@/features/collections/collection-offers-panel", () => ({
  CollectionOffersPanel: (props: Record<string, unknown>) => (
    <div data-testid="collection-offers-panel">Offers: {props.address as string} in {props.currency as string}</div>
  ),
}));
vi.mock("@/features/collections/analytics/collection-analytics", () => ({
  CollectionAnalytics: (props: Record<string, unknown>) => (
    <div data-testid="collection-analytics">Analytics: {props.address as string}</div>
  ),
}));
vi.mock("@/features/collections/collection-stats-strip", () => ({
  CollectionStatsStrip: (props: Record<string, unknown>) => (
    <dl data-testid="collection-stats-strip">Stats: {props.address as string} in {props.currency as string}</dl>
  ),
}));
vi.mock("@/features/trading/currency-switcher", () => ({
  CurrencySwitcher: () => <div data-testid="currency-switcher">Currency switcher</div>,
}));

vi.mock("@/features/collections/trait-filter-sidebar", () => ({
  TraitFilterSidebar: () => (
    <div data-testid="trait-filter-sidebar">Trait Sidebar</div>
  ),
}));
vi.mock("@/features/cart/store/cart-store", () => ({
  CART_MAX_ITEMS: 25,
  useCartStore: (
    selector: (state: {
      items: Array<Record<string, unknown>>;
      addCandidates: typeof mockCartAddCandidates;
      setOpen: typeof mockCartSetOpen;
    }) => unknown,
  ) =>
    selector({
      items: getMockCartItems(),
      addCandidates: mockCartAddCandidates,
      setOpen: mockCartSetOpen,
    }),
}));
vi.mock("@/features/collections/sweep-bar", () => ({
  SweepBar: (props: Record<string, unknown>) => {
    mockSweepBarRender(props);
    const count = Number(props.count ?? 0);
    const maxCount = Number(props.maxCount ?? 0);
    const candidates = (props.candidates as Array<{ orderId: string }> | undefined) ?? [];
    const onCountChange = props.onCountChange as ((next: number) => void) | undefined;
    const onSweep = props.onSweep as (() => void) | undefined;

    return (
      <div data-testid="sweep-bar">
        <span data-testid="sweep-count">{count}</span>
        <span data-testid="sweep-max-count">{maxCount}</span>
        <span data-testid="sweep-candidate-order-ids">{candidates.map((item) => item.orderId).join(",")}</span>
        <button onClick={() => onCountChange?.(2)} type="button">Set sweep count 2</button>
        <button onClick={() => onSweep?.()} type="button">Commit sweep</button>
      </div>
    );
  },
}));

const collections: SeedCollection[] = [
  { address: "0xabc", name: "Genesis", projectId: "project-a" },
  { address: "0xdef", name: "Artifacts", projectId: "project-b" },
];

function successQuery(data: unknown) {
  return {
    data,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

function token(tokenId: string) {
  return {
    token_id: tokenId,
    metadata: { name: `Token #${tokenId}` },
  };
}

describe("collection route view", () => {
  beforeEach(() => {
    mockUseCollectionQuery.mockReset();
    mockUseTraitNamesSummaryQuery.mockReset();
    mockUseTraitValuesQuery.mockReset();
    mockUseCollectionListingsQuery.mockReset();
    mockUseCollectionTokensQuery.mockReset();
    mockCartAddCandidates.mockReset();
    mockCartSetOpen.mockReset();
    mockSweepBarRender.mockReset();
    mockTokenGridRender.mockReset();
    mockCartAddCandidates.mockReturnValue({ ok: true });
    setMockCartItems([]);
    setMockVisibleTokens([]);
    mockUseCollectionTokensQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
    mockUseTraitNamesSummaryQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
    mockUseTraitValuesQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
    mockUseCollectionListingsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("collection_route_loads_summary_for_address", () => {
    mockUseCollectionQuery.mockReturnValue(
      successQuery({
        projectId: "project-a",
        address: "0xabc",
        contractType: "erc721",
        metadata: { name: "Genesis" },
        totalSupply: BigInt(12),
        raw: {},
      }),
    );

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    expect(mockUseCollectionQuery).toHaveBeenCalledWith(
      { address: "0xabc", projectId: "project-a", fetchImages: true },
    );
    expect(screen.getByRole("heading", { name: "Genesis" })).toBeVisible();
  });

  it("collection_empty_state_shows_when_not_found", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0x404" collections={collections} />);

    expect(screen.getByText(/find collection/i)).toBeVisible();
  });

  it("shows_items_tab_by_default_with_market_header", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    for (const name of ["Items", "Offers", "Activity", "Analytics"]) {
      expect(screen.getByRole("tab", { name })).toBeVisible();
    }
    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("collection-token-grid")).toBeVisible();
    expect(screen.getByTestId("collection-stats-strip")).toHaveTextContent("Stats: 0xabc");
    expect(screen.getByTestId("currency-switcher")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search this collection" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Listed only" })).toBeVisible();
  });

  it("tab_changes_are_reported_to_the_url_owner_and_render_the_right_panel", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <CollectionRouteView address="0xabc" collections={collections} onTabChange={onTabChange} />,
    );
    await user.click(screen.getByRole("tab", { name: "Activity" }));
    expect(onTabChange).toHaveBeenCalledWith("activity");

    rerender(<CollectionRouteView address="0xabc" collections={collections} tab="activity" onTabChange={onTabChange} />);
    expect(await screen.findByTestId("collection-activity-feed")).toHaveTextContent("Activity: 0xabc");
    expect(screen.queryByTestId("collection-token-grid")).toBeNull();

    rerender(<CollectionRouteView address="0xabc" collections={collections} tab="offers" onTabChange={onTabChange} />);
    expect(await screen.findByTestId("collection-offers-panel")).toHaveTextContent("Offers: 0xabc");

    rerender(<CollectionRouteView address="0xabc" collections={collections} tab="analytics" onTabChange={onTabChange} />);
    expect(await screen.findByTestId("collection-analytics")).toHaveTextContent("Analytics: 0xabc");
  });

  it("search_and_listed_only_controls_report_changes", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onQueryChange = vi.fn();
    const onListedOnlyChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CollectionRouteView
        address="0xabc"
        collections={collections}
        onQueryChange={onQueryChange}
        onListedOnlyChange={onListedOnlyChange}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Search this collection" }), "fox{enter}");
    expect(onQueryChange).toHaveBeenCalledWith("fox");

    await user.click(screen.getByRole("switch", { name: "Listed only" }));
    expect(onListedOnlyChange).toHaveBeenCalledWith(true);
  });

  it("passes_query_listed_only_and_layout_to_the_grid", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const user = userEvent.setup();

    render(<CollectionRouteView address="0xabc" collections={collections} query="fox" listedOnly />);

    expect(screen.getByTestId("collection-token-grid")).toHaveTextContent("Query: fox | Listed: true");
    expect(screen.getByTestId("collection-token-grid")).toHaveTextContent("Layout: compact");
    await user.click(screen.getByRole("radio", { name: "Dense grid" }));
    expect(screen.getByTestId("collection-token-grid")).toHaveTextContent("Layout: dense");
  });

  it("active_filters_render_removable_chips", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CollectionRouteView
        address="0xabc"
        collections={collections}
        activeFilters={{ Resource: new Set(["Gold", "Wood"]) }}
        onActiveFiltersChange={onActiveFiltersChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove filter Resource: Gold" }));
    expect(onActiveFiltersChange).toHaveBeenCalledWith({ Resource: new Set(["Wood"]) });

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onActiveFiltersChange).toHaveBeenLastCalledWith({});
  });

  it("trait_sidebar_has_sticky_positioning", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    expect(screen.getByTestId("trait-sidebar-container")).toBeVisible();
  });

  it("trait_sidebar_scrolls_independently_from_token_grid", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    expect(screen.getByTestId("trait-sidebar-container")).toHaveClass(
      "xl:sticky",
      "xl:top-36",
      "self-start",
      "xl:max-h-[calc(100vh-10rem)]",
      "xl:overflow-y-auto",
    );
  });

  it("cursor_debug_badge_not_shown", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    render(<CollectionRouteView address="0xabc" collections={collections} cursor="some-cursor" />);
    expect(screen.queryByText(/cursor:/i)).toBeNull();
  });

  it("fetches_trait_names_summary_from_sdk_for_active_collection", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    expect(mockUseTraitNamesSummaryQuery).toHaveBeenCalledWith(
      expect.objectContaining({ address: "0xabc", projectId: "project-a" }),
    );
  });

  it("does_not_issue_secondary_token_query_for_sweep_candidates", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    expect(mockUseCollectionTokensQuery).not.toHaveBeenCalled();
  });

  it("keeps_on_tokens_change_callback_stable_within_same_scope", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    setMockVisibleTokens([token("1")]);
    const user = userEvent.setup();

    render(<CollectionRouteView address="0xabc" collections={collections} />);
    const firstProps = mockTokenGridRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    const firstCallback = firstProps?.onTokensChange;

    await user.click(screen.getByRole("button", { name: /emit visible tokens/i }));

    const secondProps = mockTokenGridRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    const secondCallback = secondProps?.onTokensChange;

    expect(typeof firstCallback).toBe("function");
    expect(secondCallback).toBe(firstCallback);
  });

  it("contract_type_not_shown_to_users", () => {
    mockUseCollectionQuery.mockReturnValue(
      successQuery({ metadata: { name: "Genesis" }, contractType: "erc721", address: "0xabc" })
    );
    render(<CollectionRouteView address="0xabc" collections={collections} />);
    expect(screen.queryByText(/contract type/i)).toBeNull();
  });

  it("default_collections_offer_price_and_recent_sorts_in_a_select", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onSortModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CollectionRouteView
        address="0xabc"
        collections={collections}
        sortMode="price-asc"
        onSortModeChange={onSortModeChange}
      />,
    );

    const sort = screen.getByRole("combobox", { name: "Sort items" });
    expect(sort).toHaveTextContent("Price: low to high");
    await user.click(sort);
    expect(await screen.findByRole("option", { name: "Price: high to low" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Recently added" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /power/i })).toBeNull();

    await user.click(screen.getByRole("option", { name: "Price: high to low" }));
    expect(onSortModeChange).toHaveBeenCalledWith("price-desc");
  });

  it("beasts_collection_offers_custom_sorts_with_high_to_low_first", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onSortModeChange = vi.fn();
    const user = userEvent.setup();
    const beastCollections: SeedCollection[] = [
      { address: "0xbeast", name: "Beasts", projectId: "project-beasts" },
    ];

    render(
      <CollectionRouteView
        address="0xbeast"
        collections={beastCollections}
        sortMode="price-asc"
        onSortModeChange={onSortModeChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Sort items" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual([
      "Price: low to high",
      "Price: high to low",
      "Power: high to low",
      "Power: low to high",
      "Level: high to low",
      "Level: low to high",
      "Health: high to low",
      "Health: low to high",
    ]);

    await user.click(screen.getByRole("option", { name: "Power: high to low" }));
    expect(onSortModeChange).toHaveBeenCalledWith("power-desc");
  });

  it("realms_collection_offers_a_resources_sort", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    const onSortModeChange = vi.fn();
    const user = userEvent.setup();
    const realmsCollections: SeedCollection[] = [
      { address: "0xrealm5", name: "Realms", projectId: "project-realms" },
    ];

    render(
      <CollectionRouteView
        address="0xrealm5"
        collections={realmsCollections}
        sortMode="resource-count-desc"
        onSortModeChange={onSortModeChange}
      />,
    );

    const sort = screen.getByRole("combobox", { name: "Sort items" });
    expect(sort).toHaveTextContent("Resources: high to low");
    await user.click(sort);
    expect(await screen.findByRole("option", { name: "Recently added" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /power/i })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Resources: low to high" }));
    expect(onSortModeChange).toHaveBeenCalledWith("resource-count-asc");
  });

  it("renders_banner_fallback_when_collection_metadata_has_no_image", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery({
      metadata: { name: "Beasts" },
      address: "0xbeast",
      totalSupply: BigInt(12),
    }));

    render(
      <CollectionRouteView
        address="0xbeast"
        collections={[{ address: "0xbeast", name: "Beasts", projectId: "project-beasts" }]}
      />,
    );

    expect(screen.getByAltText("Beasts banner")).toHaveAttribute("src", "/optimized/banners/beasts-640.webp");
  });

  it("collection_route_sweep_adds_cheapest_candidates_and_resets_count", async () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));
    mockUseCollectionListingsQuery.mockReturnValue(successQuery([
      { id: 11, tokenId: 1, price: 300, currency: "0xfee", quantity: 1 },
      { id: 12, tokenId: 2, price: 100, currency: "0xfee", quantity: 1 },
      { id: 13, tokenId: 3, price: 200, currency: "0xfee", quantity: 1 },
    ]));
    // The route view calls useCollectionTokensQuery directly for listed tokens.
    mockUseCollectionTokensQuery.mockReturnValue({
      data: { page: { tokens: [token("1"), token("2"), token("3")], nextCursor: null } },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
    setMockCartItems([
      {
        orderId: "12",
        collection: "0xabc",
        tokenId: "2",
        price: "100",
        currency: "0xfee",
        quantity: "1",
      },
    ]);
    setMockVisibleTokens([token("1"), token("2"), token("3")]);
    const user = userEvent.setup();

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    await user.click(screen.getByRole("button", { name: /emit visible tokens/i }));

    expect(screen.getByTestId("sweep-bar")).toBeVisible();
    expect(screen.getByTestId("sweep-max-count")).toHaveTextContent("2");
    expect(screen.getByTestId("sweep-candidate-order-ids")).toHaveTextContent("13,11");

    await user.click(screen.getByRole("button", { name: /set sweep count 2/i }));
    // Preview set contains token IDs (not order IDs), sorted by price ascending.
    expect(screen.getByTestId("token-grid-sweep-preview")).toHaveTextContent("3,1");

    await user.click(screen.getByRole("button", { name: /commit sweep/i }));

    expect(mockCartAddCandidates).toHaveBeenCalledWith([
      expect.objectContaining({ orderId: "13", tokenId: "3", price: "200" }),
      expect.objectContaining({ orderId: "11", tokenId: "1", price: "300" }),
    ]);
    expect(mockCartSetOpen).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("sweep-count")).toHaveTextContent("0");
  });

  it("renders_sweep_bar_within_collection_content_container", () => {
    mockUseCollectionQuery.mockReturnValue(successQuery(null));

    render(<CollectionRouteView address="0xabc" collections={collections} />);

    const contentContainer = screen.getByTestId("collection-content-container");
    expect(within(contentContainer).getByTestId("sweep-bar")).toBeVisible();
  });

  describe("collection name priority", () => {
    it("displays_seed_collection_name_over_sdk_metadata_name", () => {
      mockUseCollectionQuery.mockReturnValue(
        successQuery({
          address: "0xabc",
          metadata: { name: "Kilvkipkilv" },
          totalSupply: BigInt(5),
        }),
      );

      render(<CollectionRouteView address="0xabc" collections={collections} />);

      expect(screen.getByRole("heading", { name: "Genesis" })).toBeVisible();
      expect(screen.queryByText("Kilvkipkilv")).toBeNull();
    });

    it("falls_back_to_sdk_metadata_name_when_seed_name_is_absent", () => {
      const noNameCollections: SeedCollection[] = [
        { address: "0xabc", name: "", projectId: "project-a" },
      ];
      mockUseCollectionQuery.mockReturnValue(
        successQuery({
          address: "0xabc",
          metadata: { name: "SDK Collection" },
          totalSupply: BigInt(5),
        }),
      );

      render(<CollectionRouteView address="0xabc" collections={noNameCollections} />);

      expect(screen.getByRole("heading", { name: "SDK Collection" })).toBeVisible();
    });

    it("falls_back_to_address_when_both_seed_and_metadata_names_are_empty", () => {
      const noNameCollections: SeedCollection[] = [
        { address: "0xabc", name: "", projectId: "project-a" },
      ];
      mockUseCollectionQuery.mockReturnValue(
        successQuery({
          address: "0xabc",
          metadata: { name: "" },
          totalSupply: BigInt(5),
        }),
      );

      render(<CollectionRouteView address="0xabc" collections={noNameCollections} />);

      expect(screen.getByRole("heading", { name: "0xabc" })).toBeVisible();
    });
  });
});

