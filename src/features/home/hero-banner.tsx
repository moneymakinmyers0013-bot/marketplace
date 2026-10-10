import { MarketPrice } from "@/components/marketplace/market-price";
import { StatTile } from "@/components/marketplace/stat-tile";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { localImageProps } from "@/lib/marketplace/local-image";

/** Banner tiles match the collection banner's stats strip. */
const STAT_CLASS = "hero-stat min-w-24 backdrop-blur-md sm:min-w-[7.5rem]";

type HeroBannerProps = {
  name: string;
  address: string;
  imageUrl?: string | null;
  floorPrice?: string | null;
  floorCurrency?: string | null;
  totalSupply?: string | null;
  listingCount?: string | null;
  isLoading?: boolean;
};

export function HeroBanner({
  name,
  address,
  imageUrl,
  floorPrice,
  floorCurrency,
  totalSupply,
  listingCount,
  isLoading = false,
}: HeroBannerProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading featured collection" data-testid="hero-banner" className="relative h-56 w-full overflow-hidden rounded-[8px] border border-[color:var(--realm-border-etched)] sm:h-72 lg:h-80">
        <Skeleton data-testid="hero-banner-skeleton" className="h-full w-full rounded-none" />
      </div>
    );
  }

  return (
    <div
      data-testid="hero-banner"
      className="relative h-56 w-full overflow-hidden rounded-[8px] border border-[color:var(--realm-border-etched)] sm:h-72 lg:h-80"
    >
      {/* Background image */}
      <div className="hero-image absolute inset-0">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${name} banner`}
            {...localImageProps(imageUrl)}
            sizes="100vw"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            data-testid="hero-banner-gradient-fallback"
            className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(231,207,136,0.24),transparent_28rem),linear-gradient(145deg,#161b20,#070b0d_55%,#050709)]"
          />
        )}
      </div>

      {/* Gradient overlay — stronger at bottom for text readability */}
      <div className="hero-overlay absolute inset-0 bg-gradient-to-t from-[color:var(--realm-bg-void)] via-[color:var(--realm-bg-void)]/60 to-transparent" />

      {/* Content overlay — positioned at bottom, same rhythm as the collection banner */}
      <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 sm:p-6">
        <div className="hero-title flex flex-wrap items-end justify-between gap-3">
          <h2 className="market-page-title min-w-0 break-words drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
            {name}
          </h2>
          <Button asChild className="hero-cta shrink-0">
            <Link href={`/collections/${address}`}>View Collection</Link>
          </Button>
        </div>

        <dl className="flex flex-wrap gap-2">
          <StatTile size="compact" label="Floor" className={STAT_CLASS}>
            <MarketPrice amount={floorPrice} currency={floorCurrency} formatted empty="No listings" />
          </StatTile>
          <StatTile size="compact" label="Supply" className={STAT_CLASS}>
            {totalSupply ?? "—"}
          </StatTile>
          <StatTile size="compact" label="Listed" className={STAT_CLASS}>
            {listingCount ?? "—"}
          </StatTile>
        </dl>
      </div>
    </div>
  );
}
