"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { StatTile } from "@/components/marketplace/stat-tile";
import { TokenSymbol } from "@/components/ui/token-symbol";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { sameCurrency } from "@/lib/marketplace/currency-store";
import { formatNumberish } from "@/lib/marketplace/token-display";
import {
  useCollectionStatsQuery,
  useCollectionSummaryQuery,
  useTopOfferQuery,
} from "@/lib/marketplace/market-data";

/** Banner tiles share one minimum width so the strip reads as an even row. */
const TILE_CLASS = "min-w-[7.5rem] backdrop-blur-md";

type CollectionStatsStripProps = {
  address: string;
  currency: string;
};

/**
 * The at-a-glance market header: floor, top offer, 7-day volume and sales,
 * listed count and supply, all scoped to the selected currency.
 */
export function CollectionStatsStrip({ address, currency }: CollectionStatsStripProps) {
  const summary = useCollectionSummaryQuery(address);
  const stats = useCollectionStatsQuery(address, 7, currency);
  const topOffer = useTopOfferQuery(address, currency);

  const floor = summary.data?.floorByCurrency.find((entry) => sameCurrency(entry.currency, currency));
  const series = stats.data?.byCurrency.find((entry) => sameCurrency(entry.currency, currency));
  const tokenCount = formatNumberish(summary.data?.tokenCount);
  const listingCount = formatNumberish(summary.data?.listingCount);
  const listedShare =
    tokenCount && listingCount && Number(tokenCount) > 0
      ? Math.min(100, (Number(listingCount) / Number(tokenCount)) * 100)
      : null;
  const pending = (value: React.ReactNode, isPending: boolean) => (isPending ? <span role="status" aria-label="Loading statistic" className="inline-block w-16"><Skeleton className="h-5 w-full" /></span> : value);

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap" data-testid="collection-stats-strip">
      <StatTile size="compact" className={TILE_CLASS} label="Floor" help="Cheapest live listing in the selected currency from a seller who still owns the item.">
        {pending(
          floor ? (
            <>
              {formatCurrencyAmount(floor.price, currency)}
              <TokenSymbol address={currency} className="text-[color:var(--realm-text-muted)]" />
            </>
          ) : (
            <span className="text-[color:var(--realm-text-muted)]">No listings</span>
          ),
          summary.isPending,
        )}
      </StatTile>
      <StatTile size="compact" className={TILE_CLASS} label="Top offer" help="Highest open collection or item offer. Funding is checked when a seller accepts.">
        {pending(
          topOffer.data ? (
            <>
              {formatCurrencyAmount(topOffer.data.buyerDebit, currency)}
              <TokenSymbol address={currency} className="text-[color:var(--realm-text-muted)]" />
            </>
          ) : (
            <span className="text-[color:var(--realm-text-muted)]">No offers</span>
          ),
          topOffer.isPending,
        )}
      </StatTile>
      <StatTile size="compact" className={TILE_CLASS} label="7d volume" help="Gross amount paid on this marketplace over the last 7 UTC days, fees included.">
        {pending(
          series ? (
            <>
              {formatCurrencyAmount(series.volume, currency)}
              <TokenSymbol address={currency} className="text-[color:var(--realm-text-muted)]" />
            </>
          ) : (
            <>0<TokenSymbol address={currency} className="text-[color:var(--realm-text-muted)]" /></>
          ),
          stats.isPending,
        )}
      </StatTile>
      <StatTile size="compact" className={TILE_CLASS} label="7d sales">{pending(series?.sales ?? 0, stats.isPending)}</StatTile>
      <StatTile size="compact" className={TILE_CLASS} label="Listed" help="Live listings across all currencies, as a share of indexed items.">
        {pending(
          listingCount ? (
            <>
              {listingCount}
              {listedShare !== null ? (
                <span className="text-[color:var(--realm-text-muted)]">
                  {" "}
                  ({listedShare < 1 && listedShare > 0 ? "<1" : Math.round(listedShare)}%)
                </span>
              ) : null}
            </>
          ) : (
            "0"
          ),
          summary.isPending,
        )}
      </StatTile>
      <StatTile size="compact" className={TILE_CLASS} label="Items">{pending(tokenCount ?? "—", summary.isPending)}</StatTile>
    </dl>
  );
}
