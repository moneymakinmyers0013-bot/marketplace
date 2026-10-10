import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@/lib/marketplace/market-data";
import { CollectionActivityFeed } from "./collection-activity-feed";

const { request, runtime } = vi.hoisted(() => ({
  request: vi.fn(),
  runtime: { chainLabel: "SN_MAIN" as string },
}));

vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));
vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: () => runtime,
}));

const NOW = Math.floor(Date.now() / 1000);
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const SELLER = "0x0123456789abcdef0123456789abcdef01234567";
const BUYER = "0x00abcdefabcdefabcdefabcdefabcdefabcdef99";
const MAKER = "0x0fedcba9876543210fedcba9876543210fedcba9";
const BIDDER = "0x05555555555555555555555555555555555555aa";

const sale: ActivityEvent = {
  id: "sale-1",
  type: "order_filled",
  collection: "0xa",
  tokenId: "7",
  currency: STRK,
  buyerDebit: "21000000000000000000",
  sellerProceeds: "20000000000000000000",
  seller: SELLER,
  buyer: BUYER,
  provenance: { timestamp: NOW - 4 * MINUTE, transactionHash: "0xabc", blockNumber: 109 },
};
const listing: ActivityEvent = {
  id: "listing-1",
  type: "order_created",
  kind: "listing",
  collection: "0xa",
  tokenId: "3",
  currency: STRK,
  buyerDebit: "19000000000000000000",
  maker: MAKER,
  provenance: { timestamp: NOW - 3 * HOUR, transactionHash: "0xabd" },
};
const collectionOffer: ActivityEvent = {
  id: "offer-1",
  type: "order_created",
  kind: "collection_offer",
  collection: "0xa",
  tokenId: null,
  currency: STRK,
  buyerDebit: "15000000000000000000",
  maker: BIDDER,
  provenance: { timestamp: NOW - 2 * DAY },
};
const mint: ActivityEvent = {
  id: "transfer-1",
  type: "transfer",
  collection: "0xa",
  tokenId: "11",
  from: "0x0",
  to: BUYER,
  provenance: { timestamp: NOW - 3 * 7 * DAY, transactionHash: "0xabf" },
};
const noise: ActivityEvent = {
  id: "policy-1",
  type: "policy_updated",
  collection: "0xa",
  provenance: { timestamp: NOW - 10 * MINUTE },
};
const events = [sale, listing, collectionOffer, mint, noise];

function respondByType() {
  request.mockImplementation(async (_path: string, query?: { type?: string }) => ({
    items: query?.type ? events.filter((event) => event.type === query.type) : events,
    nextCursor: null,
  }));
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionActivityFeed address="0xa" />
    </QueryClientProvider>,
  );
}

async function table() {
  return within(await screen.findByRole("table"));
}

function lastQuery() {
  return request.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

describe("collection activity feed", () => {
  beforeEach(() => {
    request.mockReset();
    runtime.chainLabel = "SN_MAIN";
    respondByType();
  });

  it("renders one row per displayable event with badges, item links and participants", async () => {
    show();
    const rows = await table();

    expect(rows.getAllByRole("row")).toHaveLength(5);
    expect(screen.getByText("Showing 4 events")).toBeInTheDocument();
    for (const label of ["Sale", "Listing", "Offer", "Transfer"]) {
      expect(rows.getByText(label)).toBeInTheDocument();
    }
    expect(rows.queryByText(/policy/i)).toBeNull();

    expect(rows.getByRole("link", { name: "#7" })).toHaveAttribute("href", "/collections/0xa/7");
    expect(rows.getByRole("link", { name: "#11" })).toHaveAttribute("href", "/collections/0xa/11");
    expect(rows.getByText("Collection offer")).toBeInTheDocument();

    expect(rows.getByRole("link", { name: "0x0123...4567" })).toHaveAttribute(
      "href",
      `/profile/${SELLER}`,
    );
    const buyerLinks = rows.getAllByRole("link", { name: "0x00ab...ef99" });
    expect(buyerLinks).toHaveLength(2);
    expect(buyerLinks[0]).toHaveAttribute("href", `/profile/${BUYER}`);
    expect(rows.getByRole("link", { name: "0x0fed...cba9" })).toHaveAttribute(
      "href",
      `/profile/${MAKER}`,
    );
    expect(rows.getByRole("link", { name: "0x0555...55aa" })).toHaveAttribute(
      "href",
      `/profile/${BIDDER}`,
    );
    expect(rows.getByText("Mint")).toBeInTheDocument();

    expect(rows.getByText("21")).toBeInTheDocument();
    expect(rows.getAllByText("STRK")).toHaveLength(3);
  });

  it("shows relative times with machine-readable and full timestamps", async () => {
    show();
    const rows = await table();

    const time = rows.getByText("4m ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute(
      "dateTime",
      new Date(sale.provenance.timestamp * 1000).toISOString(),
    );
    expect(time).toHaveAttribute("title", expect.stringMatching(/\d{4}/));
    expect(rows.getByText("3h ago")).toBeInTheDocument();
    expect(rows.getByText("2d ago")).toBeInTheDocument();
    expect(rows.getByText("3w ago")).toBeInTheDocument();
  });

  it("mirrors the same events in the stacked mobile list", async () => {
    show();
    await table();
    const list = within(screen.getByRole("list", { name: "Collection activity" }));
    expect(list.getAllByRole("listitem")).toHaveLength(4);
    expect(list.getByText("Mint")).toBeInTheDocument();
  });

  it("links to the explorer only on public chains and only with a transaction hash", async () => {
    const view = show();
    let rows = await table();
    const links = rows.getAllByRole("link", { name: /view tx/i });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "https://starkscan.co/tx/0xabc");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));

    view.unmount();
    runtime.chainLabel = "LOCAL";
    show();
    rows = await table();
    expect(rows.queryByRole("link", { name: /view tx/i })).toBeNull();
  });

  it("passes the selected activity type to the query and refines offers client side", async () => {
    const user = userEvent.setup();
    show();
    await table();
    expect(request).toHaveBeenCalledWith("/collections/0xa/activity", {
      type: undefined,
      limit: 30,
      cursor: undefined,
    }, undefined, expect.any(AbortSignal));
    expect(screen.getByRole("group", { name: "Activity type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Sales" }));
    expect(screen.getByRole("button", { name: "Sales" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "order_filled" }));
    await waitFor(() => expect(screen.getByText("Showing 1 event")).toBeInTheDocument());
    expect((await table()).getByText("Sale")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Offers" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "order_created" }));
    await waitFor(() => expect(screen.getByText("Showing 1 event")).toBeInTheDocument());
    const offers = await table();
    expect(offers.getByText("Offer")).toBeInTheDocument();
    expect(offers.queryByText("Listing")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Listings" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "order_created" }));
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Listing")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Transfers" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "transfer" }));
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Transfer")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(screen.getByText("Showing 4 events")).toBeInTheDocument());
  });

  it("names the active filter in the empty state", async () => {
    const user = userEvent.setup();
    request.mockResolvedValue({ items: [], nextCursor: null });
    show();
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Sales" }));
    expect(await screen.findByText("No sales yet.")).toBeInTheDocument();
  });

  it("shows a loading state before data arrives", () => {
    request.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByRole("status", { name: "Loading activity" })).toBeInTheDocument();
    expect(screen.queryByText(/showing/i)).toBeNull();
  });

  it("offers a retry that refetches after a failure", async () => {
    const user = userEvent.setup();
    request.mockRejectedValueOnce(new Error("indexer offline"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Activity is unavailable");
    expect(screen.queryByText(/no activity yet/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await table()).getAllByRole("row")).toHaveLength(5);
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads the next page with the cursor and disables the button while fetching", async () => {
    const user = userEvent.setup();
    let release: (page: unknown) => void = () => {};
    request
      .mockResolvedValueOnce({ items: [sale], nextCursor: "cursor-2" })
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    show();
    await table();

    const more = screen.getByRole("button", { name: "Load more" });
    expect(more).toBeEnabled();
    await user.click(more);
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith("/collections/0xa/activity", {
        type: undefined,
        limit: 30,
        cursor: "cursor-2",
      }, undefined, expect.any(AbortSignal)),
    );
    expect(screen.getByRole("button", { name: /loading more/i })).toBeDisabled();

    release({ items: [listing], nextCursor: null });
    await waitFor(() => expect(screen.getByText("Showing 2 events")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });
});
