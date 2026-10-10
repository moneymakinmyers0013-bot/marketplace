import { dehydrate, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PublicHydrationBoundary } from "./public-hydration-boundary";

it("keeps the first render consistent when an RSC query promise resolves before hydration", async () => {
  const server = new QueryClient(), firstRender = new QueryClient(), browser = new QueryClient();
  const fetch = vi.fn(async () => "Browser request should not be needed");
  const pending = server.prefetchQuery({ queryKey: ["secondary"], queryFn: () => new Promise<string>(() => {}) });
  const state = dehydrate(server, { shouldDehydrateQuery: () => true });
  // React Server Components can supply a synchronously fulfilled thenable.
  state.queries[0].promise = {
    then(resolve: (value: string) => unknown) { resolve("Streamed content"); return Promise.resolve("Streamed content"); },
  } as unknown as Promise<string>;
  function Content() {
    const query = useQuery({ queryKey: ["secondary"], queryFn: fetch, staleTime: 30_000 });
    return <p>{query.data ?? "Loading section"}</p>;
  }
  const view = (client: QueryClient) => <QueryClientProvider client={client}><PublicHydrationBoundary state={state}><Content /></PublicHydrationBoundary></QueryClientProvider>;
  try {
    expect(renderToString(view(firstRender))).toContain("Loading section");
    render(view(browser));
    expect(await screen.findByText("Streamed content")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  } finally { await server.cancelQueries(); await pending; server.clear(); firstRender.clear(); browser.clear(); }
});
