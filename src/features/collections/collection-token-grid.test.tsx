import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionTokenGrid } from "@/features/collections/collection-token-grid";
import { _resetConfigCache } from "@/lib/marketplace/config";
import { encodeRangeFilterValue } from "@/lib/marketplace/traits";
import type { ActiveFilters } from "@/lib/marketplace/traits";

const { mockUseCollectionTokensQuery, mockUseCollectionListingsQuery } = vi.hoisted(() => ({
  mockUseCollectionTokensQuery: vi.fn(),
  mockUseCollectionListingsQuery: vi.fn(),
}));
const { mockCartAddItem, mockCartSetOpen } = vi.hoisted(() => ({
  mockCartAddItem: vi.fn(),
  mockCartSetOpen: vi.fn(),
}));

vi.mock("@/lib/marketplace/hooks", () => ({
  useCollectionTokensQuery: mockUseCollectionTokensQuery,
  useCollectionListingsQuery: mockUseCollectionListingsQuery,
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

describe("collection token grid", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MARKETPLACE_COLLECTIONS =
      "0x123|Realms|project-realms,0xbea57|Beasts|project-beasts";
    _resetConfigCache();
    mockUseCollectionTokensQuery.mockReset();
    mockUseCollectionListingsQuery.mockReset();
    mockCartAddItem.mockReset();
    mockCartSetOpen.mockReset();
    mockCartAddItem.mockReturnValue({ ok: true });
    mockUseCollectionListingsQuery.mockReturnValue(successListingsResult([]));
  });

  it("token_grid_renders_first_page_with_skeleton_then_data", async () => {
    let isLoaded = false;
    mockUseCollectionTokensQuery.mockImplementation(() => {
      if (isLoaded) {
        return {
          data: {
            page: {
              tokens: [token("1"), token("2")],
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

      return {
        data: undefined,
        isLoading: true,
        isSuccess: false,
        isError: false,
        error: null,
        isFetching: true,
        refetch: vi.fn(),
      };
    });

    const { rerender } = render(
      <CollectionTokenGrid address="0xabc" projectId="project-a" />,
    );

    expect(screen.getAllByTestId("token-skeleton")).toHaveLength(6);

    isLoaded = true;

    rerender(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(await screen.findByText("Token #1")).toBeVisible();
    expect(await screen.findByText("Token #2")).toBeVisible();
  });

  it("token_grid_loads_next_cursor_page_without_duplicates", async () => {
    mockUseCollectionTokensQuery.mockImplementation((options) => {
      const cursor = options?.cursor;
      if (cursor === "cursor-2") {
        return {
          data: {
            page: {
              tokens: [token("2"), token("3")],
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

      return {
        data: {
          page: {
            tokens: [token("1"), token("2")],
            nextCursor: "cursor-2",
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
    });

    const user = userEvent.setup();
    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(screen.getByText("Token #1")).toBeVisible();
    expect(screen.getByText("Token #2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(
      await screen.findByRole("article", { name: "token-3" }),
    ).toBeVisible();
    expect(screen.getAllByText("Token #2")).toHaveLength(1);
  });

  it("token_grid_respects_limit_and_tokenIds_filters", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [],
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
    });

    render(
      <CollectionTokenGrid
        address="0xabc"
        projectId="project-a"
        limit={10}
        tokenIds={["7", "9"]}
      />,
    );

    expect(mockUseCollectionTokensQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: "0xabc",
        project: "project-a",
        limit: 10,
        tokenIds: ["7", "9"],
      }),
    );
  });


  it("token_grid_uses_image_fallback_when_missing", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: undefined,
              metadata: {
                name: "Token #1",
                image_url: "https://cdn.example/token-1.png",
              },
            }),
          ],
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
    });

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(await screen.findByAltText("Token #1")).toHaveAttribute(
      "src",
      "https://cdn.example/token-1.png",
    );
  });

  it("beasts_grid_uses_uncropped_card_media", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/beast-1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });

    render(<CollectionTokenGrid address="0xbea57" projectId="project-beasts" />);

    const image = await screen.findByAltText("Token #1");
    expect(image.parentElement).toHaveClass("aspect-[3/4]");
    expect(image).toHaveClass("object-contain");
  });

  it("token_cards_link_to_token_detail_page", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
            token("2", {
              image: "https://cdn.example/2.png",
              metadata: { name: "Token #2" },
            }),
          ],
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
    });

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    const link = screen.getByRole("link", { name: "token-1" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/collections/0xabc/1");

    const link2 = screen.getByRole("link", { name: "token-2" });
    expect(link2).toBeVisible();
    expect(link2).toHaveAttribute("href", "/collections/0xabc/2");
  });

  it("active_filters_passed_to_owned_query", () => {
    const filters: ActiveFilters = { Background: new Set(["Blue"]) };
    mockUseCollectionTokensQuery.mockReturnValue({
      data: { page: { tokens: [], nextCursor: null }, error: null },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(
      <CollectionTokenGrid
        activeFilters={filters}
        address="0xabc"
        projectId="project-a"
      />,
    );

    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        attributeFilters: { Background: ["Blue"] },
      }),
    );
  });

  it("token_grid_filters_tokens_by_active_filters", async () => {
    const filters: ActiveFilters = { Background: new Set(["Blue"]) };
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              metadata: {
                name: "Token #1",
                attributes: [{ trait_type: "Background", value: "Blue" }],
              },
            }),
          ],
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
    });

    render(
      <CollectionTokenGrid
        activeFilters={filters}
        address="0xabc"
        projectId="project-a"
      />,
    );

    expect(await screen.findByText("Token #1")).toBeVisible();
    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        attributeFilters: { Background: ["Blue"] },
      }),
    );
  });

  it("range_filters_do_not_become_exact_match_filters", async () => {
    const filters: ActiveFilters = { Level: new Set([encodeRangeFilterValue(10, 20)]) };
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              metadata: {
                name: "Token #1",
                attributes: [{ trait_type: "Level", value: "15" }],
              },
            }),
            token("2", {
              metadata: {
                name: "Token #2",
                attributes: [{ trait_type: "Level", value: "25" }],
              },
            }),
          ],
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
    });

    render(
      <CollectionTokenGrid
        activeFilters={filters}
        address="0xabc"
        projectId="project-a"
      />,
    );

    expect(await screen.findByText("Token #1")).toBeVisible();
    expect(screen.queryByText("Token #2")).toBeNull();
    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        attributeFilters: undefined,
      }),
    );
  });

  it("formats_hex_ids_and_renders_price_in_shared_card_layout", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("0x460", {
              image: "https://cdn.example/1120.png",
              metadata: { name: "Golden Token #1120" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 501,
          tokenId: "0x460",
          price: 77,
          currency: "0xfee",
          quantity: 1,
        },
      ]),
    );

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    // The name already ends with the decimal id, so the card omits a repeated "#1120" line;
    // the hex id is still formatted for the card body label below.
    expect(await screen.findByText("Golden Token #1120")).toBeVisible();
    expect(screen.queryByText("#1120")).toBeNull();
    expect(screen.getByText("77")).toBeVisible();

    const tokenCardBody = screen.getByRole("article", { name: "token-1120" });
    const card = tokenCardBody.closest("[data-slot='card']");
    expect(card).toHaveClass("py-0", "overflow-hidden");
  });

  it("passes_collection_listing_query_args", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: { page: { tokens: [], nextCursor: null }, error: null },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(mockUseCollectionListingsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "0xabc",
        projectId: "project-a",
        limit: 100,
        verifyOwnership: false,
      }),
    );
  });

  it("token_grid_add_to_cart_resolves_cheapest_listing", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 21, tokenId: 1, price: 200, currency: "0xfee", quantity: 1 },
        { id: 22, tokenId: 1, price: 120, currency: "0xfee", quantity: 1 },
      ]),
    );

    const user = userEvent.setup();
    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "22",
        collection: "0xabc",
        tokenId: "1",
        price: "120",
      }),
    );
    expect(mockCartSetOpen).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /added/i })).toBeVisible();
  });

  it("token_grid_matches_collection_scoped_listing_token_ids", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 21, tokenId: "0xabc:0x1", price: 120, currency: "0xfee", quantity: 1 },
      ]),
    );

    const user = userEvent.setup();
    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(await screen.findByText("120")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "21",
        collection: "0xabc",
        tokenId: "1",
        price: "120",
      }),
    );
  });

  it("token_grid_add_to_cart_ignores_expired_listings", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        {
          id: 21,
          tokenId: 1,
          price: 90,
          currency: "0xfee",
          quantity: 1,
          expiration: now - 60,
        },
        {
          id: 22,
          tokenId: 1,
          price: 120,
          currency: "0xfee",
          quantity: 1,
          expiration: now + 3600,
        },
      ]),
    );

    const user = userEvent.setup();
    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "22",
        collection: "0xabc",
        tokenId: "1",
        price: "120",
      }),
    );
  });

  it("token_grid_opens_cart_when_add_to_cart_is_rejected", async () => {
    mockCartAddItem.mockReturnValue({ ok: false, error: "Cart only supports a single currency." });
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 21, tokenId: 1, price: 200, currency: "0xfee", quantity: 1 },
      ]),
    );

    const user = userEvent.setup();
    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(mockCartSetOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: /added/i })).toBeNull();
  });

  it("card_body_links_to_details_without_changing_cart", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              image: "https://cdn.example/1.png",
              metadata: { name: "Token #1" },
            }),
          ],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 22, tokenId: 1, price: 120, currency: "0xfee", quantity: 1 },
      ]),
    );

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    const link = await screen.findByRole("link", { name: "token-1" });
    expect(link).toHaveAttribute("href", "/collections/0xabc/1");
    expect(mockCartAddItem).not.toHaveBeenCalled();
    expect(mockCartSetOpen).not.toHaveBeenCalled();
  });

  it("renders_grid_density_buttons_with_compact_default", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [token("1")],
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
    });

    render(
      <CollectionTokenGrid
        address="0xabc"
        projectId="project-a"
        toolbar={<div data-testid="toolbar-slot">Toolbar</div>}
      />,
    );

    expect(screen.getByTestId("toolbar-slot")).toBeVisible();
    expect(screen.queryByRole("button", { name: /compact/i })).toBeNull();
    expect(screen.getByTestId("collection-token-grid-cards")).toHaveClass(
      "market-asset-grid",
    );
  });

  it("density_buttons_update_grid_layout_classes", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [token("1")],
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
    });

    const { rerender } = render(
      <CollectionTokenGrid address="0xabc" projectId="project-a" layout="compact" />,
    );

    expect(screen.getByTestId("collection-token-grid-cards")).toHaveClass("market-asset-grid");
    expect(screen.getByTestId("collection-token-grid-cards")).not.toHaveClass("market-asset-grid-dense");

    rerender(<CollectionTokenGrid address="0xabc" projectId="project-a" layout="dense" />);
    expect(screen.getByTestId("collection-token-grid-cards")).toHaveClass("market-asset-grid-dense");
  });

  it("list_view_renders_tokens_in_a_table_layout", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [token("1")],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 21, tokenId: 1, price: 200, currency: "0xfee", quantity: 1 },
      ]),
    );

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" layout="list" />);

    const table = screen.getByTestId("collection-token-grid-table");
    expect(table).toBeVisible();
    expect(screen.queryByTestId("collection-token-grid-cards")).toBeNull();
    expect(screen.getByRole("link", { name: /token #1/i })).toHaveAttribute(
      "href",
      "/collections/0xabc/1",
    );
    expect(screen.getByText("200")).toBeVisible();
  });

  it("tokens_reset_when_address_prop_changes", async () => {
    mockUseCollectionTokensQuery.mockImplementation((options) => {
      const tokens =
        options?.address === "0xabc"
          ? [token("1"), token("2")]
          : [token("99")];
      return {
        data: { page: { tokens, nextCursor: null }, error: null },
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      };
    });

    const { rerender } = render(
      <CollectionTokenGrid address="0xabc" projectId="project-a" />,
    );

    expect(await screen.findByText("Token #1")).toBeVisible();
    expect(screen.getByText("Token #2")).toBeVisible();

    rerender(<CollectionTokenGrid address="0xnew" projectId="project-a" />);

    expect(await screen.findByText("Token #99")).toBeVisible();
    // Tokens from old address must not persist
    expect(screen.queryByText("Token #1")).toBeNull();
    expect(screen.queryByText("Token #2")).toBeNull();
  });

  it("tokens_reset_when_active_filters_change", async () => {
    const filtersA: ActiveFilters = { Background: new Set(["Blue"]) };
    const filtersB: ActiveFilters = { Background: new Set(["Red"]) };

    mockUseCollectionTokensQuery.mockImplementation((options) => {
      const hasBlue = options?.attributeFilters?.Background?.includes("Blue");
      const tokens = hasBlue
        ? [
          token("10", {
            metadata: {
              name: "Token #10",
              attributes: [{ trait_type: "Background", value: "Blue" }],
            },
          }),
        ]
        : [
          token("20", {
            metadata: {
              name: "Token #20",
              attributes: [{ trait_type: "Background", value: "Red" }],
            },
          }),
        ];
      return {
        data: { page: { tokens, nextCursor: null }, error: null },
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      };
    });

    const { rerender } = render(
      <CollectionTokenGrid
        address="0xabc"
        projectId="project-a"
        activeFilters={filtersA}
      />,
    );

    expect(await screen.findByText("Token #10")).toBeVisible();

    rerender(
      <CollectionTokenGrid
        address="0xabc"
        projectId="project-a"
        activeFilters={filtersB}
      />,
    );

    expect(await screen.findByText("Token #20")).toBeVisible();
    expect(screen.queryByText("Token #10")).toBeNull();
  });

  it("empty_state_shows_friendly_text_not_cli_aesthetic", () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: { page: { tokens: [], nextCursor: null }, error: null },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<CollectionTokenGrid address="0xabc" projectId="project-a" />);

    expect(screen.getByText(/no tokens match/i)).toBeVisible();
    expect(screen.queryByText(/grep/i)).toBeNull();
  });





  it("renders_inline_resource_icons_on_realms_cards_only", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              metadata: {
                name: "Realm #1",
                attributes: [
                  { trait_type: "Resource", value: "Coal" },
                  { trait_type: "Resource", value: "Stone" },
                ],
              },
            }),
          ],
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
    });

    const { rerender } = render(
      <CollectionTokenGrid address="0x123" projectId="project-realms" />,
    );

    expect(await screen.findByRole("img", { name: "Coal" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Stone" })).toBeVisible();

    rerender(
      <CollectionTokenGrid address="0xbea57" projectId="project-beasts" />,
    );

    expect(screen.queryByTestId("resource-trait-icons")).toBeNull();
  });

  it("shows_resource_traits_inline_in_list_view_for_realms", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [
            token("1", {
              metadata: {
                name: "Realm #1",
                attributes: [
                  { trait_type: "Resource", value: "Coal" },
                  { trait_type: "Resource", value: "Wood" },
                ],
              },
            }),
          ],
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
    });

    render(<CollectionTokenGrid address="0x123" projectId="project-realms" layout="list" />);

    const traitIcons = await screen.findByTestId("resource-trait-icons");
    expect(traitIcons).toHaveTextContent("Coal");
    expect(traitIcons).toHaveTextContent("Wood");
  });


  it("highlights_sweep_preview_tokens_by_order_id", async () => {
    mockUseCollectionTokensQuery.mockReturnValue({
      data: {
        page: {
          tokens: [token("1"), token("2")],
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
    });
    mockUseCollectionListingsQuery.mockReturnValue(
      successListingsResult([
        { id: 21, tokenId: 1, price: 100, currency: "0xfee", quantity: 1 },
        { id: 22, tokenId: 2, price: 200, currency: "0xfee", quantity: 1 },
      ]),
    );

    render(
      <CollectionTokenGrid
        address="0xabc"
        projectId="project-a"
        sweepPreviewTokenIds={new Set(["1"])}
      />,
    );

    const previewArticle = await screen.findByRole("article", { name: "token-1" });
    const nonPreviewArticle = screen.getByRole("article", { name: "token-2" });
    const previewRingWrapper = previewArticle.closest("[data-slot='card']")!.parentElement!;
    const nonPreviewRingWrapper = nonPreviewArticle.closest("[data-slot='card']")!.parentElement!;

    expect(previewRingWrapper).toHaveClass("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
    expect(nonPreviewRingWrapper).not.toHaveClass("ring-2");
  });
  it.each(["price-asc", "price-desc", "power-desc", "health-asc", "resource-count-desc"] as const)("delegates %s to full-dataset API and preserves returned order", async (sortMode) => {
    mockUseCollectionTokensQuery.mockReturnValue({data:{page:{tokens:[token("90"),token("2")],nextCursor:null}},isSuccess:true,isLoading:false});
    render(<CollectionTokenGrid address="0xabc" sortMode={sortMode}/>);
    await screen.findByRole("article",{name:"token-90"});
    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(expect.objectContaining({sort:sortMode,currency:expect.any(String)}));
    expect(screen.getAllByRole("article").map(card=>card.getAttribute("aria-label"))).toEqual(["token-90","token-2"]);
    expect(mockUseCollectionTokensQuery.mock.calls.every(call=>call[0].tokenIds===undefined)).toBe(true);
  });

});
