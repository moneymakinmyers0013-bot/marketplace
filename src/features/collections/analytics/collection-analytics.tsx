"use client";

import { useMemo, useState } from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { StatTile } from "@/components/marketplace/stat-tile";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
import { sameCurrency } from "@/lib/marketplace/currency-store";
import { useMarketConfig } from "@/lib/marketplace/react";
import {
  STATS_PERIODS,
  useCollectionListingsPageQuery,
  useCollectionStatsQuery,
  type StatsPeriod,
} from "@/lib/marketplace/market-data";
import { FloorHistoryChart, type FloorPoint } from "./floor-history-chart";
import { SalesChart, type SalePoint } from "./sales-chart";
import { VolumeChart } from "./volume-chart";
import { DepthChart } from "./depth-chart";
import {
  bucketListingsByPrice,
  bucketSales,
  formatCompact,
  percentChange,
  toDisplayNumber,
} from "./chart-utils";
import { cn } from "@/lib/utils";

const DAY = 86400;
const PERIOD_LABELS: Record<StatsPeriod, string> = { 1: "1d", 7: "7d", 30: "30d", 90: "90d" };

type CollectionAnalyticsProps = {
  address: string;
  currency: string;
};

/** Floor change over the period: green up, red down, muted when flat. */
function FloorDelta({ delta }: { delta: number }) {
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <span
      className={cn(
        direction === "up" && "text-emerald-400",
        direction === "down" && "text-red-400",
        direction === "flat" && "text-muted-foreground",
      )}
    >
      {direction === "up" ? "▲" : direction === "down" ? "▼" : "•"} {Math.abs(delta).toFixed(1)}% in period
    </span>
  );
}

/**
 * Market analytics for one collection in the selected currency: floor
 * history, sales, volume and listing depth, with a period filter that scopes
 * every figure below it.
 */
export function CollectionAnalytics({ address, currency }: CollectionAnalyticsProps) {
  const [days, setDays] = useState<StatsPeriod>(7);
  const config = useMarketConfig();
  const decimals =
    config.data?.currencies.find((c) => sameCurrency(c.address, currency))?.decimals ?? 18;
  const symbol = getTokenSymbol(currency);
  const stats = useCollectionStatsQuery(address, days, currency);
  const listings = useCollectionListingsPageQuery(address, currency, 100);

  const [mountedAt] = useState(() => Math.floor(Date.now() / 1000));
  const windowEnd = stats.data?.periodEnd ?? mountedAt;
  const windowStart = stats.data?.periodStart ?? windowEnd - days * DAY;
  const series = stats.data?.byCurrency.find((entry) => sameCurrency(entry.currency, currency));

  const sales = useMemo<SalePoint[]>(
    () =>
      (series?.history ?? [])
        .map((sale) => ({
          timestamp: sale.timestamp,
          price: toDisplayNumber(sale.price, decimals) ?? 0,
          tokenId: sale.tokenId,
        }))
        .filter((sale) => sale.price > 0),
    [series, decimals],
  );
  const bucketSeconds = days === 1 ? 3600 : DAY;
  const volumeBuckets = useMemo(
    () => bucketSales(series?.history ?? [], windowStart, windowEnd, bucketSeconds, decimals),
    [series, windowStart, windowEnd, bucketSeconds, decimals],
  );
  const floorPoints = useMemo<FloorPoint[]>(
    () =>
      (stats.data?.floorHistory ?? [])
        .filter((point) => sameCurrency(point.currency, currency))
        .map((point) => ({
          timestamp: point.timestamp,
          price: point.price === null ? null : toDisplayNumber(point.price, decimals),
        })),
    [stats.data?.floorHistory, currency, decimals],
  );
  const definedFloors = floorPoints.filter((p) => p.price !== null) as Array<{ price: number }>;
  const floorDelta =
    definedFloors.length >= 2
      ? percentChange(definedFloors[0].price, definedFloors[definedFloors.length - 1].price)
      : null;
  const currentFloor = stats.data?.floors.find((entry) => sameCurrency(entry.currency, currency))?.price;

  const listingPrices = useMemo(
    () =>
      (listings.data?.items ?? [])
        .map((order) => toDisplayNumber(order.buyerDebit, decimals))
        .filter((price): price is number => price !== null),
    [listings.data, decimals],
  );
  const depthBuckets = useMemo(() => bucketListingsByPrice(listingPrices, 10), [listingPrices]);

  const volumeText = series ? `${formatCurrencyAmount(series.volume, currency)} ${symbol}` : `0 ${symbol}`;
  const salesCount = series?.sales ?? 0;
  const average = series && series.sales > 0 ? (toDisplayNumber(series.volume, decimals) ?? 0) / series.sales : null;

  return (
    <div className="space-y-4" data-testid="collection-analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="market-label" id="analytics-period-label">
            Period
          </span>
          <ToggleGroupPrimitive.Root
            type="single"
            aria-labelledby="analytics-period-label"
            value={String(days)}
            onValueChange={(value) => {
              if (value) setDays(Number(value) as StatsPeriod);
            }}
            className="market-segmented"
          >
            {STATS_PERIODS.map((period) => (
              <ToggleGroupPrimitive.Item
                key={period}
                value={String(period)}
                aria-label={`Last ${period} day${period === 1 ? "" : "s"}`}
                className="market-segment h-9 min-w-11 px-2"
              >
                {PERIOD_LABELS[period]}
              </ToggleGroupPrimitive.Item>
            ))}
          </ToggleGroupPrimitive.Root>
        </div>
        <p className="text-xs text-muted-foreground">
          Figures cover this marketplace only, in {symbol}, on UTC calendar days.
        </p>
      </div>

      {stats.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Market statistics are unavailable right now.{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => void stats.refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="analytics-stat-tiles">
        <StatTile
          label="Volume"
          note={`${PERIOD_LABELS[days]} gross, fees included`}
          help="Everything buyers paid in this period, including marketplace fees and royalties."
        >
          {stats.isPending ? "…" : volumeText}
        </StatTile>
        <StatTile label="Sales" note={`${PERIOD_LABELS[days]} fills`}>
          {stats.isPending ? "…" : String(salesCount)}
        </StatTile>
        <StatTile label="Average price" note="Volume divided by sales">
          {stats.isPending ? "…" : average === null ? "—" : `${formatCompact(average)} ${symbol}`}
        </StatTile>
        <StatTile
          label="Floor"
          note={floorDelta === null ? "Cheapest live listing" : <FloorDelta delta={floorDelta} />}
          help="The cheapest listing from a seller who still owns the item. The change compares the first and last floor recorded in the period."
        >
          {stats.isPending
            ? "…"
            : currentFloor
              ? `${formatCurrencyAmount(currentFloor, currency)} ${symbol}`
              : "No listings"}
        </StatTile>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <FloorHistoryChart
          points={floorPoints}
          windowStart={windowStart}
          windowEnd={windowEnd}
          symbol={symbol}
          loading={stats.isPending}
          refreshing={stats.isFetching && !stats.isPending}
        />
        <VolumeChart
          buckets={volumeBuckets}
          bucketSeconds={bucketSeconds}
          symbol={symbol}
          loading={stats.isPending}
          refreshing={stats.isFetching && !stats.isPending}
        />
        <SalesChart
          sales={sales}
          windowStart={windowStart}
          windowEnd={windowEnd}
          symbol={symbol}
          historyLimit={stats.data?.historyLimit}
          loading={stats.isPending}
          refreshing={stats.isFetching && !stats.isPending}
        />
        <DepthChart
          buckets={depthBuckets}
          listingCount={listingPrices.length}
          sampled={!!listings.data?.nextCursor}
          symbol={symbol}
          loading={listings.isPending}
          refreshing={listings.isFetching && !listings.isPending}
        />
      </div>
    </div>
  );
}
