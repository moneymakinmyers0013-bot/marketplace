import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoveryRoute } from "@/features/nft-discovery/discovery-route";

export const metadata: Metadata = {
  title: "NFT discovery | Realms.market",
  description: "Browse published Starknet NFT observations with explicit, incomplete indexing coverage. Discovery records are not enabled for trading.",
};

export default function DiscoveryPage() {
  return <main className="market-page py-6"><Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading NFT discovery…</p>}><DiscoveryRoute /></Suspense></main>;
}
