import { HydrationBoundary } from "@tanstack/react-query";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { prefetchCollectionPage } from "@/lib/marketplace/public-prefetch";
import { publicHydrationState } from "@/lib/marketplace/server-hydration";
import { CollectionRouteContainer } from "./collection-route-container";

export async function CollectionPageData({ address, search }: {
  address: string;
  search: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const projectId = getMarketplaceRuntimeConfig().collections.find(collection => collection.address === address)?.projectId;
  const state = await publicHydrationState(client => prefetchCollectionPage(client, { address, params, projectId }));
  return <HydrationBoundary state={state}>
    <CollectionRouteContainer address={address} cursor={params.get("cursor")} />
  </HydrationBoundary>;
}
