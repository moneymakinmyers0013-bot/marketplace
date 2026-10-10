import { PublicHydrationBoundary } from "@/components/providers/public-hydration-boundary";
import { MarketplaceHome } from "@/components/marketplace/marketplace-home";
import { streamedPublicHydrationState } from "@/lib/marketplace/server-hydration";
import { prefetchHomeSections } from "@/lib/marketplace/public-prefetch";
import { homeCollectionsOptions } from "./home-query-options";

export async function HomePageData() {
  const state = await streamedPublicHydrationState(async client => {
    await client.prefetchQuery(homeCollectionsOptions());
    return client.getQueryState(homeCollectionsOptions().queryKey)?.status === "success";
  }, client => prefetchHomeSections(client));
  return <PublicHydrationBoundary state={state}><MarketplaceHome /></PublicHydrationBoundary>;
}
