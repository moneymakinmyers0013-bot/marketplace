import { dehydrate, QueryClient } from "@tanstack/react-query";

/** Request-local, public-only cache. A slow API must not hold the route indefinitely. */
export async function publicHydrationState(prefetch: (client: QueryClient) => Promise<unknown>, budgetMs = 1500) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const timer = setTimeout(() => { void client.cancelQueries(); }, budgetMs);
  try {
    await prefetch(client);
    return dehydrate(client);
  } finally {
    clearTimeout(timer);
    client.clear();
  }
}

/** Stream optional queries through TanStack's dehydrated promises after primary content. */
export async function streamedPublicHydrationState(
  essential: (client: QueryClient) => Promise<boolean>,
  supplementary: (client: QueryClient) => Promise<unknown>,
  budgetMs = 1500,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const timer = setTimeout(() => { void client.cancelQueries(); }, budgetMs);
  try {
    const ready = await essential(client);
    clearTimeout(timer);
    if (!ready) {
      const state = dehydrate(client);
      client.clear();
      return state;
    }
    // Start before dehydrating so the browser receives the in-flight promises and
    // does not repeat these requests. SDK transport still bounds each read at 15s.
    const pending = supplementary(client);
    const state = dehydrate(client, {
      shouldDehydrateQuery: query => query.state.status === "success" || query.state.status === "pending",
    });
    void pending.then(() => client.clear(), () => client.clear());
    return state;
  } catch (error) {
    client.clear();
    throw error;
  } finally { clearTimeout(timer); }
}
