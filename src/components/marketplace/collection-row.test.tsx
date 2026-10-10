import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CollectionRow } from "@/components/marketplace/collection-row";

const { mockUseCollectionTokensQuery } = vi.hoisted(() => ({
  mockUseCollectionTokensQuery: vi.fn(),
}));
const { mockUseCollectionListingsQuery } = vi.hoisted(() => ({
  mockUseCollectionListingsQuery: vi.fn(),
}));
const { mockUseCollectionQuery } = vi.hoisted(() => ({
  mockUseCollectionQuery: vi.fn(),
}));
const { mockCartAddItem, mockCartSetOpen } = vi.hoisted(() => ({
  mockCartAddItem: vi.fn(),
  mockCartSetOpen: vi.fn(),
}));

vi.mock("@/lib/marketplace/hooks", () => ({
  useCollectionTokensQuery: mockUseCollectionTokensQuery,
  useCollectionListingsQuery: mockUseCollectionListingsQuery,
  useCollectionQuery: mockUseCollectionQuery,
}));

vi.mock("@/features/cart/store/cart-store", () => ({
  useCartStore: (
    selector: (state: { addItem: typeof mockCartAddItem; setOpen: typeof mockCartSetOpen }) => unknown,
  ) => selector({ addItem: mockCartAddItem, setOpen: mockCartSetOpen }),
}));

function token(tokenId: string, overrides?: Record<string, unknown>) {
  return {
    token_id: tokenId,
    metadata: { name: `Token #${tokenId}` },
    ...overrides,
  };
}

function successResult(tokens: ReturnType<typeof token>[]) {
  return {
    data: {
      page: {
        tokens,
        nextCursor: null,
      },
      error: null,
    },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

function successListingsResult(listings: Array<Record<string, unknown>>) {
  return {
    data: listings,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

describe("collection row", () => {
  beforeEach(() => {
    mockUseCollectionTokensQuery.mockReset();
    mockUseCollectionListingsQuery.mockReset();
    mockUseCollectionQuery.mockReset();
    mockCartAddItem.mockReset();
    mockCartSetOpen.mockReset();
    mockCartAddItem.mockReturnValue({ ok: true });
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([token("1"), token("2")]),
    );
    mockUseCollectionListingsQuery.mockReturnValue(successListingsResult([]));
    mockUseCollectionQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders_collection_name", () => {
    render(
      <CollectionRow address="0xabc" name="Cool Cats" />,
    );

    expect(
      screen.getByRole("heading", { name: "Cool Cats" }),
    ).toBeVisible();
  });

  it("renders_token_cards_from_sdk", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
        token("2", {
          image: "https://cdn.example/2.png",
          metadata: { name: "Beta" },
        }),
        token("3", {
          image: "https://cdn.example/3.png",
          metadata: { name: "Gamma" },
        }),
      ]),
    );

    render(
      <CollectionRow address="0xabc" name="My Collection" />,
    );

    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.getByAltText("Alpha")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.getByAltText("Beta")).toBeVisible();
    expect(screen.getByText("Gamma")).toBeVisible();
    expect(screen.getByAltText("Gamma")).toBeVisible();
  });

  it("shows_skeleton_while_loading", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
      isFetching: true,
      refetch: vi.fn(),
    });

    render(
      <CollectionRow address="0xabc" name="Loading Collection" />,
    );

    expect(screen.getAllByTestId("collection-row-skeleton")).toHaveLength(6);
  });

  it("shows_empty_state_when_no_tokens", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([]),
    );

    render(
      <CollectionRow address="0xabc" name="Empty Collection" />,
    );

    expect(screen.getByText(/ls tokens/i)).toBeVisible();
  });

  it("falls_back_to_listing_token_ids_when_tokens_endpoint_is_empty", () => {
    mockUseCollectionTokensQuery.mockReturnValue(successResult([]));
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 17,
          tokenId: 777,
          price: 101,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    render(<CollectionRow address="0xabc" name="Listing-backed Collection" />);

    expect(screen.queryByText(/ls tokens/i)).toBeNull();
    expect(screen.getByText("Token #777")).toBeVisible();
    expect(screen.getByText("101")).toBeVisible();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeEnabled();
  });

  it("fetches_listing_backed_token_metadata_for_images_when_primary_tokens_are_empty", () => {
    mockUseCollectionTokensQuery.mockImplementation((options) => {
      const request = options as { tokenIds?: string[] };
      if (request.tokenIds) {
        return successResult([
          token("777", {
            image: "https://cdn.example/777.png",
            metadata: { name: "Listed 777" },
          }),
        ]);
      }

      return successResult([]);
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 17,
          tokenId: 777,
          price: 101,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    render(<CollectionRow address="0xabc" name="Listing-backed Collection" />);

    expect(screen.getByAltText("Listed 777")).toBeVisible();
    expect(screen.queryByText("No Image")).toBeNull();
    expect(screen.getByText("101")).toBeVisible();
  });

  it("requests_listing_metadata_with_decimal_and_hex_token_ids", () => {
    mockUseCollectionTokensQuery.mockImplementation((options) => {
      const request = options as { tokenIds?: string[] };
      if (request.tokenIds?.includes("0x935")) {
        return successResult([
          token("0x935", {
            image: "https://cdn.example/2357.png",
            metadata: { name: "Loot Chest #2357" },
          }),
        ]);
      }

      return successResult([]);
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 99,
          tokenId: 2357,
          price: 149,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    render(<CollectionRow address="0xabc" name="Loot Chests" />);

    const listingMetadataRequest = mockUseCollectionTokensQuery.mock.calls
      .map(([options]) => options as { tokenIds?: string[] })
      .find((options) => Array.isArray(options.tokenIds));

    expect(listingMetadataRequest?.tokenIds).toEqual(
      expect.arrayContaining(["2357", "0x935"]),
    );
    expect(screen.getByAltText("Loot Chest #2357")).toBeVisible();
    // The name already ends with the id, so the card shows no separate "#2357" line.
    expect(screen.getByText("Loot Chest #2357")).toBeVisible();
    expect(screen.queryByText("No Image")).toBeNull();
  });

  it("uses_listing_backed_tokens_when_loaded_tokens_have_no_listing_prices", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Token #1" },
        }),
      ]),
    );
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 17,
          tokenId: 777,
          price: 101,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    render(<CollectionRow address="0xabc" name="Listing-first Collection" />);

    expect(screen.queryByText("Token #1")).toBeNull();
    expect(screen.getByText("Token #777")).toBeVisible();
    expect(screen.getByText("101")).toBeVisible();
  });

  it("prefers_priced_loaded_tokens_when_listings_exist", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Token #1" },
        }),
        token("777", {
          image: "https://cdn.example/777.png",
          metadata: { name: "Token #777" },
        }),
      ]),
    );
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 17,
          tokenId: 777,
          price: 101,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    render(<CollectionRow address="0xabc" name="Prioritized Pricing Collection" />);

    expect(screen.queryByText("Token #1")).toBeNull();
    expect(screen.getByText("Token #777")).toBeVisible();
    expect(screen.getByText("101")).toBeVisible();
  });

  it("passes_correct_args_to_hook", () => {
    render(
      <CollectionRow
        address="0x123"
        name="Test Collection"
        projectId="my-project"
      />,
    );

    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0x123",
        project: "my-project",
        limit: 12,
        fetchImages: true,
      }),
    );
  });

  it("links_collection_name_to_detail_page", () => {
    render(
      <CollectionRow address="0xdef" name="Linked Collection" />,
    );

    const link = screen.getByRole("link", { name: "Linked Collection" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/collections/0xdef");
  });

  it("token_cards_link_to_token_page", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(
      <CollectionRow address="0xabc" name="Clickable Collection" />,
    );

    const tokenLink = screen.getByRole("link", { name: /alpha/i });
    expect(tokenLink).toBeVisible();
    expect(tokenLink).toHaveAttribute("href", "/collections/0xabc/1");
  });

  it("formats_hex_token_ids_for_display", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("0x460", {
          image: "https://cdn.example/1120.png",
          // A name without the id, so the card renders its formatted "#id" line.
          metadata: { name: "Golden Token" },
        }),
      ]),
    );

    render(
      <CollectionRow address="0xabc" name="Hex Collection" />,
    );

    expect(screen.getByText("#1120")).toBeVisible();
    expect(screen.queryByText("#0x460")).toBeNull();
  });

  it("renders_price_below_token_id", () => {
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 7,
          tokenId: 1,
          price: 100,
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(
      <CollectionRow address="0xabc" name="Priced Collection" />,
    );

    expect(screen.getByText("100")).toBeVisible();
  });

  it("formats_wei_prices_in_token_cards", () => {
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 7,
          tokenId: 1,
          price: "150000000000000000000",
          currency: "0xfee",
          quantity: 1,
          owner: "0xowner",
        },
      ]),
    );

    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(<CollectionRow address="0xabc" name="Wei Collection" />);

    expect(screen.getByText("150")).toBeVisible();
    expect(screen.queryByText("150000000000000000000")).toBeNull();
  });

  it("renders_price_when_listing_lacks_currency_but_has_token_and_price", () => {
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          tokenId: 1,
          price: 88,
        },
      ]),
    );
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(<CollectionRow address="0xabc" name="Partially Mapped Collection" />);

    expect(screen.getByText("88")).toBeVisible();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeDisabled();
  });

  it("passes_collection_listing_query_args", () => {
    render(
      <CollectionRow
        address="0x123"
        name="Listings Hook Collection"
        projectId="my-project"
      />,
    );

    expect(mockUseCollectionListingsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "0x123",
        projectId: "my-project",
        limit: 100,
        verifyOwnership: false,
      }),
    );
  });

  it("collection_and_home_add_to_cart_resolves_cheapest_listing", async () => {
    const user = userEvent.setup();
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 10, tokenId: 1, price: 150, currency: "0xfee", quantity: 1 },
        { id: 11, tokenId: 1, price: 90, currency: "0xfee", quantity: 1 },
      ]),
    );
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(<CollectionRow address="0xabc" name="Addable Collection" />);

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "11",
        collection: "0xabc",
        tokenId: "1",
        price: "90",
        currency: "0xfee",
      }),
    );
    expect(mockCartSetOpen).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /added/i })).toBeVisible();
  });

  it("collection_and_home_add_to_cart_ignores_expired_listings", async () => {
    const now = Math.floor(Date.now() / 1000);
    const user = userEvent.setup();
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 10,
          tokenId: 1,
          price: 90,
          currency: "0xfee",
          quantity: 1,
          expiration: now - 60,
        },
        {
          id: 11,
          tokenId: 1,
          price: 120,
          currency: "0xfee",
          quantity: 1,
          expiration: now + 3600,
        },
      ]),
    );
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(<CollectionRow address="0xabc" name="Addable Collection" />);

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "11",
        collection: "0xabc",
        tokenId: "1",
        price: "120",
        currency: "0xfee",
      }),
    );
  });

  it("makes_token_image_flush_to_card_edges", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
      ]),
    );

    render(
      <CollectionRow address="0xabc" name="Flush Layout Collection" />,
    );

    const tokenLink = screen.getByRole("link", { name: /alpha/i });
    const card = tokenLink.closest("[data-slot='card']") ?? tokenLink.querySelector("[data-slot='card']");
    expect(card).toHaveClass("py-0", "overflow-hidden");
  });

  it("price_label_prefix_is_never_shown", () => {
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 7, tokenId: 1, price: 100, currency: "0xfee", quantity: 1, owner: "0xowner" },
      ]),
    );
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", { image: "https://cdn.example/1.png", metadata: { name: "Alpha" } }),
      ]),
    );
    render(<CollectionRow address="0xabc" name="Test Collection" />);
    expect(screen.queryByText(/^price:/i)).toBeNull();
  });

  it("no_price_element_shown_when_token_has_no_listing", () => {
    mockUseCollectionListingsQuery.mockReturnValue(successListingsResult([]));
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", { image: "https://cdn.example/1.png", metadata: { name: "Alpha" } }),
      ]),
    );
    render(<CollectionRow address="0xabc" name="Test" />);
    // The invisible placeholder "—" exists for height alignment but is visually hidden
    const dash = screen.queryByText("—");
    if (dash) {
      expect(dash).toHaveClass("invisible");
    }
  });

  it("filters_tokens_when_search_matches_token_name_or_id", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successResult([
        token("1", {
          image: "https://cdn.example/1.png",
          metadata: { name: "Alpha" },
        }),
        token("2", {
          image: "https://cdn.example/2.png",
          metadata: { name: "Beta" },
        }),
      ]),
    );

    render(
      <CollectionRow
        address="0xabc"
        name="Searchable Collection"
        searchQuery="2"
      />,
    );

    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("keeps_collection_visible_when_search_matches_collection_name", () => {
    render(
      <CollectionRow
        address="0xabc"
        name="Cool Cats"
        searchQuery="cool"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Cool Cats" }),
    ).toBeVisible();
    expect(screen.getByText("Token #1")).toBeVisible();
    expect(screen.getByText("Token #2")).toBeVisible();
  });

  it("hides_collection_row_when_search_has_no_match", () => {
    render(
      <CollectionRow
        address="0xabc"
        name="Cool Cats"
        searchQuery="not-found"
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Cool Cats" }),
    ).toBeNull();
    expect(screen.queryByText("Token #1")).toBeNull();
    expect(screen.queryByText("Token #2")).toBeNull();
  });
});
