import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionAnalytics } from "./collection-analytics";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));
vi.mock("@/lib/marketplace/react", () => ({
  useMarketConfig: () => ({ data: { currencies: [{ address: STRK, symbol: "STRK", decimals: 18 }] } }),
}));

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH = 10n ** 18n;
const NOW = 1_760_000_000;
const DAY = 86400;

function stats(days: number) {
  return {
    days,
    periodStart: NOW - days * DAY,
    periodEnd: NOW,
    byCurrency: [
      {
        currency: STRK,
        volume: (60n * ETH).toString(),
        sales: 3,
        history: [
          { timestamp: NOW - 3 * DAY, price: (18n * ETH).toString(), tokenId: "7" },
          { timestamp: NOW - 2 * DAY, price: (20n * ETH).toString(), tokenId: "8" },
          { timestamp: NOW - DAY, price: (22n * ETH).toString(), tokenId: "9" },
        ],
      },
    ],
    floors: [{ currency: STRK, symbol: "STRK", price: (21n * ETH).toString() }],
    floorHistory: [
      { currency: STRK, price: (20n * ETH).toString(), timestamp: NOW - 5 * DAY },
      { currency: STRK, price: null, timestamp: NOW - 4 * DAY },
      { currency: STRK, price: (22n * ETH).toString(), timestamp: NOW - 2 * DAY },
    ],
    historyLimit: 200,
  };
}

function renderAnalytics() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionAnalytics address="0xabc" currency={STRK} />
    </QueryClientProvider>,
  );
}

describe("CollectionAnalytics", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (path: string, query?: Record<string, unknown>) => {
      if (path === "/collections/0xabc/stats") return stats(Number(query?.days ?? 7));
      if (path === "/collections/0xabc/listings")
        return {
          items: [21n, 22n, 25n, 40n].map((price, i) => ({
            id: `l${i}`,
            buyerDebit: (price * ETH).toString(),
            currency: STRK,
          })),
          nextCursor: null,
        };
      throw new Error(`unexpected ${path}`);
    });
  });

  it("summarises the period and draws every chart with a table twin", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    expect(await screen.findByText("60 STRK")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("20 STRK")).toBeVisible();
    expect(screen.getByText("21 STRK")).toBeVisible();
    expect(screen.getByText(/10\.0% in period/)).toBeVisible();

    expect(screen.getByRole("img", { name: /floor price in STRK/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /3 sales in STRK/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /volume per day/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /listings by price band/i })).toBeInTheDocument();

    const floor = within(screen.getByTestId("chart-floor-price"));
    await user.click(floor.getByRole("radio", { name: "table" }));
    expect(floor.getByRole("table")).toBeVisible();
    expect(floor.getByText("No listings")).toBeVisible();
  });

  it("refetches every figure for the chosen period", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await screen.findByText("60 STRK");
    await user.click(screen.getByRole("radio", { name: "Last 30 days" }));
    expect(await screen.findByText("30d gross, fees included")).toBeVisible();
    expect(request).toHaveBeenCalledWith("/collections/0xabc/stats", { days: 30, currency: STRK }, undefined, expect.any(AbortSignal));
  });

  it("reports when statistics cannot be loaded", async () => {
    request.mockImplementation(async (path: string) => {
      if (path === "/collections/0xabc/stats") throw new Error("boom");
      return { items: [], nextCursor: null };
    });
    renderAnalytics();
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  });
});
