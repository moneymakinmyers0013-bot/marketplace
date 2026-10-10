"use client";
import { MarketPrice } from "@/components/marketplace/market-price";
import { TokenMedia } from "@/components/marketplace/token-media";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CollectionCardData } from "./types";

type PromotedCollectionProps = CollectionCardData;

/** A second collection given room to breathe beside the table; data comes from the catalog call. */
export function PromotedCollection({
  address,
  name,
  imageUrl,
  floorPrice,
  floorCurrency,
  totalSupply,
  listingCount,
}: PromotedCollectionProps) {
  return (
    <div className="realm-panel sticky top-32 overflow-hidden" data-testid="promoted-collection">
      <div className="relative aspect-[4/3] w-full bg-muted">
        <TokenMedia alt={`${name} artwork`} sources={imageUrl ? [imageUrl] : []} sizes="320px" />
        <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--realm-bg-void)] via-[color:var(--realm-bg-void)]/45 to-transparent" />
      </div>

      <div className="space-y-3 p-4">
        <h3 className="realm-title text-2xl">{name}</h3>
        <div className="flex flex-wrap gap-2">
          <div className="realm-stat-pill px-2.5 py-1 text-xs">
            <span className="mr-1 text-muted-foreground">Floor</span>
            <span className="font-medium text-primary">
              <MarketPrice amount={floorPrice} currency={floorCurrency} formatted empty="No listings" />
            </span>
          </div>
          {totalSupply ? (
            <div className="realm-stat-pill px-2.5 py-1 text-xs">
              <span className="mr-1 text-muted-foreground">Items</span>
              <span className="font-medium">{totalSupply}</span>
            </div>
          ) : null}
          {listingCount ? (
            <div className="realm-stat-pill px-2.5 py-1 text-xs">
              <span className="mr-1 text-muted-foreground">Listed</span>
              <span className="font-medium">{listingCount}</span>
            </div>
          ) : null}
        </div>

        <Button asChild className="min-h-11 w-full">
          <Link href={`/collections/${address}`}>Explore {name}</Link>
        </Button>
      </div>
    </div>
  );
}
