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
