import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiOrder } from "@/lib/marketplace/types";
import { CollectionOffersPanel } from "./collection-offers-panel";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));
vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: () => ({ chainLabel: "LOCAL" }),
}));
vi.mock("@/features/trading/order-composer", () => ({
  OrderComposer: ({ collection, kind }: { collection: string; kind: string }) => (
    <form aria-label="Offer form" data-collection={collection} data-kind={kind}>
      <label htmlFor="price">Price</label>
      <input id="price" type="text" />
    </form>
  ),
}));

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const BIDDER = "0x0123456789abcdef0123456789abcdef01234567";
const OTHER = "0x00abcdefabcdefabcdefabcdefabcdefabcdef99";

function order(overrides: Partial<ApiOrder> & { id: string }): ApiOrder {
  return {
    maker: BIDDER,
    nonce: "1",
    kind: "collection_offer",
    state: "open",
    collection: "0xa",
    tokenId: null,
    currency: STRK,
    buyerDebit: "15000000000000000000",
    expiry: String(NOW + 5 * DAY + 1800),
    royaltyAmount: "0",
    royaltyCap: "0",
    royaltyRecipient: "0x0",
    feeBps: 200,
    ...overrides,
  };
}

const collectionOffer = order({ id: "offer-a", availability: "funding_unchecked" });
const tokenOffer = order({
  id: "offer-b",
  kind: "token_offer",
  tokenId: "7",
  maker: OTHER,
  buyerDebit: "14000000000000000000",
  expiry: String(NOW + 3 * 3600 + 900),
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionOffersPanel address="0xa" currency={STRK} />
    </QueryClientProvider>,
  );
}

async function list() {
  return within(await screen.findByRole("list", { name: "Open offers" }));
}

describe("collection offers panel", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ items: [collectionOffer, tokenOffer], nextCursor: null });
  });

  it("requests open offers in the active currency", async () => {
    show();
    await list();
    expect(request).toHaveBeenCalledWith("/collections/0xa/offers", {
      state: "open",
      currency: STRK,
      tokenMatch: undefined,
      limit: 25,
      cursor: undefined,
    }, undefined, expect.any(AbortSignal));
  });

  it("renders each offer with amount, kind, maker, expiry and availability", async () => {
    show();
    const rows = await list();
    expect(rows.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();

    const [first, second] = rows.getAllByRole("listitem");
    expect(within(first).getByText("15")).toBeInTheDocument();
    expect(within(first).getByText("STRK")).toBeInTheDocument();
    expect(within(first).getByText("Collection offer")).toBeInTheDocument();
    expect(within(first).queryByRole("link", { name: /^#/ })).toBeNull();
    expect(within(first).getByRole("link", { name: "0x0123...4567" })).toHaveAttribute(
      "href",
      `/profile/${BIDDER}`,
    );
    expect(within(first).getByText("Expires in 5 days")).toBeInTheDocument();
    expect(within(first).getByText("Funding is checked at acceptance")).toBeInTheDocument();

    expect(within(second).getByText("14")).toBeInTheDocument();
    expect(within(second).getByText("Token offer")).toBeInTheDocument();
    expect(within(second).getByRole("link", { name: "#7" })).toHaveAttribute(
      "href",
      "/collections/0xa/7",
    );
    expect(within(second).getByRole("link", { name: "0x00ab...ef99" })).toHaveAttribute(
      "href",
      `/profile/${OTHER}`,
    );
    expect(within(second).getByText("Expires in 3 hours")).toBeInTheDocument();
    expect(within(second).queryByText("Funding is checked at acceptance")).toBeNull();
  });

  it("opens an inline collection offer composer and returns focus on close", async () => {
    const user = userEvent.setup();
    show();
    await list();
    const toggle = screen.getByRole("button", { name: "Make collection offer" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Price" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Offer form" });
    expect(form).toHaveAttribute("data-collection", "0xa");
    expect(form).toHaveAttribute("data-kind", "collection_offer");
    expect(toggle.getAttribute("aria-controls")).toBe(form.closest("[id]")?.id);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(screen.getByRole("textbox", { name: "Price" })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull();
  });

  it("shows a loading state before offers arrive", () => {
    request.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByRole("status", { name: "Loading offers" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Open offers" })).toBeNull();
  });

  it("invites the first offer when none are open", async () => {
    request.mockResolvedValue({ items: [], nextCursor: null });
    show();
    expect(
      await screen.findByText("No open offers. Be the first to make one."),
    ).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Open offers" })).toBeNull();
  });

  it("offers a retry that refetches after a failure", async () => {
    const user = userEvent.setup();
    request.mockRejectedValueOnce(new Error("indexer offline"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Offers are unavailable");
    expect(screen.queryByText(/no open offers/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await list()).getAllByRole("listitem")).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads the next page with the cursor and disables the button while fetching", async () => {
    const user = userEvent.setup();
    let release: (page: unknown) => void = () => {};
    request
      .mockResolvedValueOnce({ items: [collectionOffer], nextCursor: "cursor-2" })
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    show();
    await list();
    expect(screen.getByText("1+")).toBeInTheDocument();

    const more = screen.getByRole("button", { name: "Load more" });
    expect(more).toBeEnabled();
    await user.click(more);
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith("/collections/0xa/offers", {
        state: "open",
        currency: STRK,
        tokenMatch: undefined,
        limit: 25,
        cursor: "cursor-2",
      }, undefined, expect.any(AbortSignal)),
    );
    expect(screen.getByRole("button", { name: /loading more/i })).toBeDisabled();

    release({ items: [tokenOffer], nextCursor: null });
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Open offers" })).getAllByRole("listitem"),
      ).toHaveLength(2),
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });
});
