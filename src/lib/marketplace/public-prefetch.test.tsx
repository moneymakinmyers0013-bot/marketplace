import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { prefetchCollectionPage, collectionPageTokenOptions } from "./public-prefetch";
import { useCollectionTokensQuery } from "./hooks";
import { useCollectionSummaryQuery } from "./market-data";
import { collectionTokensOptions, collectionStatsOptions } from "./public-queries";
import { publicHydrationState } from "./server-hydration";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("hydrates a filtered collection into the client without repeating its public reads", async () => {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost");
    const data = url.pathname.endsWith("/tokens")
      ? { items: [{ collection: "0xa", tokenId: "9007199254740993", owner: "0x2", metadata: { name: "Filtered Realm" }, attributes: [] }], nextCursor: "next" }
      : url.pathname.endsWith("/offers") || url.pathname.endsWith("/listings")
        ? { items: [], nextCursor: null }
        : url.pathname.endsWith("/traits") ? []
          : url.pathname.endsWith("/stats") ? { days: 7, byCurrency: [], floors: [] }
            : { address: "0xa", name: "Realms", tokenCount: "1", listingCount: "0", floorByCurrency: [] };
    return new Response(JSON.stringify({ data }));
  });
  vi.stubGlobal("fetch", fetch);
  const server = new QueryClient();
  const browser = new QueryClient();
  const params = new URLSearchParams("q=Realm&sort=price-desc&listed=1&trait=Resource:Wood");
  try {
    await prefetchCollectionPage(server, { address: "0xa", params, currency: "0x1" });
    hydrate(browser, dehydrate(server));
    fetch.mockClear();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={browser}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({
      tokens: useCollectionTokensQuery(collectionPageTokenOptions({ address: "0xa", params, currency: "0x1" })),
      summary: useCollectionSummaryQuery("0xa"),
    }), { wrapper });
    expect(result.current.tokens.data?.page.tokens[0].token_id).toBe("9007199254740993");
    expect(result.current.summary.data?.name).toBe("Realms");
    expect(fetch).not.toHaveBeenCalled();
  } finally { server.clear(); browser.clear(); }
});

it("keeps currency, filters, cursor and deployment snapshots separate", () => {
  const client = new QueryClient();
  const base = { address: "0xa", params: new URLSearchParams("q=Realm&listed=1&trait=Resource:Wood&cursor=page2"), currency: "0x1" };
  const options = collectionPageTokenOptions(base);
  expect(options).toMatchObject({ cursor: "page2", q: "Realm", listedOnly: true, filters: [{ name: "Resource", values: ["Wood"] }] });
  client.setQueryData(collectionTokensOptions(options).queryKey, { page: { tokens: [], nextCursor: null }, error: null });
  for (const changed of [{ ...options, currency: "0x2" }, { ...options, cursor: undefined }, { ...options, filters: [] }, { ...options, q: "Other" }, { ...options, sort: "recent" as const }]) {
    expect(client.getQueryData(collectionTokensOptions(changed).queryKey)).toBeUndefined();
  }
  vi.stubEnv("NEXT_PUBLIC_MARKETPLACE_ADDRESS", "0x999");
  expect(client.getQueryData(collectionTokensOptions(options).queryKey)).toBeUndefined();
  client.clear();
});

it("cancels slow public reads at the server budget instead of hydrating false empty data", async () => {
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    requestSignal = init.signal!;
    requestSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })));
  const state = await publicHydrationState(client => client.prefetchQuery(collectionStatsOptions("0xa", 7, "0x1")), 20);
  expect(requestSignal?.aborted).toBe(true);
  expect(state.queries).toEqual([]);
});
