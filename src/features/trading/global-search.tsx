"use client";
import { AssetGridSkeleton } from "@/components/marketplace/loading-state";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { marketplaceRequest, tokenFromApi } from "@/lib/marketplace/api-client";
import type { ApiCollection, ApiToken } from "@/lib/marketplace/types";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { SectionHeader } from "@/components/marketplace/section-header";
export function GlobalSearch({ query }: { query: string }) {
  const result = useQuery({
    queryKey: ["owned", "search", query],
    queryFn: () =>
      marketplaceRequest<{ collections: ApiCollection[]; tokens: ApiToken[] }>(
        "/search",
        { q: query },
      ),
  });
  return (
    <main className="market-page space-y-8">
      <h1 className="market-page-title break-words">Search: {query}</h1>
      {result.isPending ? (
        <AssetGridSkeleton label="Searching marketplace" gridClassName="grid-cols-2 md:grid-cols-4" />
      ) : result.isError ? (
        <p role="alert">Search is unavailable. Try again shortly.</p>
      ) : (
        <>
          <section className="space-y-3">
            <SectionHeader title="Collections" count={result.data.collections.length} />
            <div className="flex flex-wrap gap-3">
              {result.data.collections.map((c) => (
                <Link
                  key={c.address}
                  className="realm-panel rounded-md p-4 hover:border-primary"
                  href={`/collections/${c.address}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <SectionHeader title="NFTs" count={result.data.tokens.length} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {result.data.tokens.map((t) => (
                <MarketplaceTokenCard
                  key={t.id}
                  token={tokenFromApi(t)}
                  href={`/collections/${t.collection}/${t.tokenId}`}
                />
              ))}
            </div>
          </section>
          {!result.data.collections.length && !result.data.tokens.length && (
            <p>No results found.</p>
          )}
        </>
      )}
    </main>
  );
}
