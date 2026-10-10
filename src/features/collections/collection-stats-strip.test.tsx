import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionStatsStrip } from "./collection-stats-strip";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH = 10n ** 18n;

function renderStrip() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionStatsStrip address="0xabc" currency={STRK} />
    </QueryClientProvider>,
  );
}

describe("CollectionStatsStrip", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (path: string, query?: Record<string, unknown>) => {
      if (path === "/collections/0xabc")
        return {
          address: "0xabc",
          name: "Realms",
          tokenCount: "8000",
          listingCount: "400",
          floorByCurrency: [{ currency: STRK, symbol: "STRK", price: (22n * ETH).toString() }],
        };
      if (path === "/collections/0xabc/stats")
        return {
          days: query?.days,
          byCurrency: [{ currency: STRK, volume: (523n * ETH).toString(), sales: 24, history: [] }],
          floors: [],
        };
      if (path === "/collections/0xabc/offers")
        return { items: [{ id: "o1", buyerDebit: (19n * ETH).toString(), currency: STRK }], nextCursor: null };
      throw new Error(`unexpected ${path}`);
    });
  });

  it("shows floor, top offer, 7d volume and sales, listed share and supply", async () => {
    renderStrip();
    expect(await screen.findByText("22")).toBeVisible();
    expect(screen.getByText("19")).toBeVisible();
    expect(screen.getByText("523")).toBeVisible();
    expect(screen.getByText("24")).toBeVisible();
    expect(screen.getByText("400")).toBeVisible();
    expect(screen.getByText(/\(5%\)/)).toBeVisible();
    expect(screen.getByText("8000")).toBeVisible();
    expect(request).toHaveBeenCalledWith("/collections/0xabc/stats", { days: 7, currency: STRK }, undefined, expect.any(AbortSignal));
  });

  it("explains each figure on demand", async () => {
    renderStrip();
    await screen.findByText("22");
    expect(screen.getByRole("button", { name: "About floor" })).toBeVisible();
    expect(screen.getByRole("button", { name: "About top offer" })).toBeVisible();
  });

  it("shows empty states when the market is quiet", async () => {
    request.mockImplementation(async (path: string) => {
      if (path === "/collections/0xabc")
        return { address: "0xabc", name: "Realms", tokenCount: "10", listingCount: "0", floorByCurrency: [] };
      if (path === "/collections/0xabc/stats") return { days: 7, byCurrency: [], floors: [] };
      if (path === "/collections/0xabc/offers") return { items: [], nextCursor: null };
      throw new Error(`unexpected ${path}`);
    });
    renderStrip();
    expect(await screen.findByText("No listings")).toBeVisible();
    expect(screen.getByText("No offers")).toBeVisible();
  });
});
