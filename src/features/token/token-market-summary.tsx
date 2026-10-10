"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { MarketPrice } from "@/components/marketplace/market-price";
import { StatTile } from "@/components/marketplace/stat-tile";
import type { MarketAmount } from "@/lib/marketplace/market-figures";

export type { MarketAmount } from "@/lib/marketplace/market-figures";
export { pickLastSale, pickTopOffer } from "@/lib/marketplace/market-figures";

export type TokenMarketSummaryProps = {
  /** Cheapest open listing in base units, including fees. */
  price?: string | null;
  currency?: string | null;
  topOffer?: MarketAmount | null;
  lastSale?: MarketAmount | null;
  /** Open listings for this token; mentioned when more than one is live. */
  listedCount?: number;
  priceLoading?: boolean;
  offersLoading?: boolean;
  activityLoading?: boolean;
};

const HELP = {
  price:
    "The cheapest open listing for this token. It includes marketplace fees and royalties; network fees are separate.",
  topOffer:
    "The highest open offer for this token or its collection. Funds stay in the bidder's wallet and are checked again when the owner accepts.",
  lastSale: "The most recent sale of this token filled on this marketplace.",
} as const;

/** Three at-a-glance market figures for one token. On phones the price leads on its own row. */
export function TokenMarketSummary({
  price,
  currency,
  topOffer,
  lastSale,
  listedCount,
  priceLoading = false,
  offersLoading = false,
  activityLoading = false,
}: TokenMarketSummaryProps) {
  return (
    <dl
      data-testid="token-market-summary"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <StatTile
        label="Price"
        help={HELP.price}
        className="col-span-2 sm:col-span-1"
        valueTestId="market-summary-price"
        note={
          listedCount !== undefined && listedCount > 1
            ? `${listedCount} open listings`
            : undefined
        }
      >
        {priceLoading ? (
          <span role="status" aria-label="Loading price">
            <Skeleton className="h-7 w-24" />
          </span>
        ) : (
          <MarketPrice amount={price} currency={currency} empty="Not listed" />
        )}
      </StatTile>
      <StatTile
        label="Top offer"
        help={HELP.topOffer}
        valueTestId="market-summary-top-offer"
      >
        {offersLoading ? (
          <span role="status" aria-label="Loading top offer">
            <Skeleton className="h-7 w-24" />
          </span>
        ) : (
          <MarketPrice
            amount={topOffer?.amount}
            currency={topOffer?.currency}
            empty="No offers"
          />
        )}
      </StatTile>
      <StatTile
        label="Last sale"
        help={HELP.lastSale}
        valueTestId="market-summary-last-sale"
      >
        {activityLoading ? (
          <span role="status" aria-label="Loading last sale">
            <Skeleton className="h-7 w-24" />
          </span>
        ) : (
          <MarketPrice
            amount={lastSale?.amount}
            currency={lastSale?.currency}
            empty="No sales yet"
          />
        )}
      </StatTile>
    </dl>
  );
}
