import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { prefetchHomePage, prefetchTokenPage } from "./public-prefetch";
import { useHomePageData } from "@/features/home/use-home-page-data";
import { useRecentSales } from "@/features/home/use-recent-sales";
import { useTokenDetailQuery } from "./hooks";
import { useCollectionOffersQuery } from "./market-data";
import { streamedPublicHydrationState } from "./server-hydration";

afterEach(() => vi.unstubAllGlobals());
const token = { collection: "0xa", tokenId: "6", owner: "0x2", metadata: { name: "Realm #6" }, attributes: [], listings: [] };
const collection = { address: "0xa", name: "Realms", tokenCount: "1", listingCount: "0", floorByCurrency: [] };
function fakeApi() {
  const request = vi.fn(async (input: string | Request | URL) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const data = path.endsWith("/collections") ? [collection]
      : path.endsWith("/activity") ? { items: [{ id: "sale", type: "order_filled", collection: "0xa", tokenId: "6", buyerDebit: "10", currency: "0x1", provenance: { timestamp: 1700000000 } }], nextCursor: null }
        : path.endsWith("/tokens") ? { items: [token], nextCursor: null }
          : path.includes("/tokens/") ? token
            : path.endsWith("/offers") || path.endsWith("/listings") ? { items: [], nextCursor: null }
              : path.endsWith("/traits") ? []
                : path.endsWith("/stats") ? { days: 7, byCurrency: [], floors: [] } : collection;
    return new Response(JSON.stringify({ data }));
  });
  vi.stubGlobal("fetch", request);
  return request;
}

it("hydrates the home catalog and recent-sale artwork without a browser waterfall", async () => {
  const request = fakeApi();
  const server = new QueryClient(), browser = new QueryClient();
  try {
    await prefetchHomePage(server);
    hydrate(browser, dehydrate(server));
    request.mockClear();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={browser}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ home: useHomePageData(), sales: useRecentSales("0xa") }), { wrapper });
    expect(result.current.home.featuredCollection?.name).toBe("Realms");
    expect(result.current.sales.data?.[0].token.token_id).toBe("6");
    expect(request).not.toHaveBeenCalled();
  } finally { server.clear(); browser.clear(); }
});

it("hydrates public token details and matching offers without a wallet", async () => {
  const request = fakeApi();
  const server = new QueryClient(), browser = new QueryClient();
  try {
    await prefetchTokenPage(server, { address: "0xa", tokenId: "6" });
    hydrate(browser, dehydrate(server));
    request.mockClear();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={browser}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({
      token: useTokenDetailQuery({ collection: "0xa", tokenId: "6", fetchImages: true }),
      offers: useCollectionOffersQuery("0xa", { tokenMatch: "6", limit: 50 }),
    }), { wrapper });
    expect(result.current.token.data?.token?.token_id).toBe("6");
    expect(result.current.offers.data?.pages[0].items).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  } finally { server.clear(); browser.clear(); }
});

it("delivers primary data while a secondary section is still fetching", async () => {
  let finish!: (value: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const state = await streamedPublicHydrationState(
    async client => { await client.prefetchQuery({ queryKey: ["primary"], queryFn: async () => "ready" }); return true; },
    client => client.prefetchQuery({ queryKey: ["secondary"], queryFn: () => pending }),
  );
  expect(state.queries.find(query => query.queryKey[0] === "primary")?.state.data).toBe("ready");
  const secondary = state.queries.find(query => query.queryKey[0] === "secondary");
  expect(secondary?.state.status).toBe("pending");
  finish("later");
  expect(await secondary?.promise).toBe("later");
});
