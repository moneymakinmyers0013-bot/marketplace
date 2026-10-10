import { HydrationBoundary } from "@tanstack/react-query";
import { streamedPublicHydrationState } from "@/lib/marketplace/server-hydration";
import { prefetchTokenPage } from "@/lib/marketplace/public-prefetch";
import { tokenDetailsOptions } from "@/lib/marketplace/public-queries";
import { TokenDetailView } from "./token-detail-view";

export async function TokenPageData({ address, tokenId }: { address: string; tokenId: string }) {
  const options = tokenDetailsOptions({ collection: address, tokenId });
  const state = await streamedPublicHydrationState(async client => {
    await client.prefetchQuery(options);
    return client.getQueryState(options.queryKey)?.status === "success";
  }, client => prefetchTokenPage(client, { address, tokenId }));
  return <HydrationBoundary state={state}><TokenDetailView address={address} tokenId={tokenId} /></HydrationBoundary>;
}
