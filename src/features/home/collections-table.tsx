"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck } from "lucide-react";
import { TokenMedia } from "@/components/marketplace/token-media";
import { TokenSymbol } from "@/components/ui/token-symbol";
import { InfoTip } from "@/components/marketplace/info-tip";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import type { CollectionStats } from "@/lib/marketplace/market-data";
import { sameCurrency } from "@/lib/marketplace/currency-store";
import type { CollectionCardData } from "./types";
import { cn } from "@/lib/utils";

type SortKey = "rank" | "floor" | "volume" | "listed" | "items";
type SortState = { key: SortKey; direction: "asc" | "desc" };

type CollectionsTableProps = {
  collections: CollectionCardData[];
  currency: string;
  isLoading?: boolean;
};

const COLUMNS: Array<{ key: SortKey; label: string; help?: string; align: "left" | "right"; className?: string }> = [
  { key: "rank", label: "Collection", align: "left" },
  { key: "floor", label: "Floor", help: "Cheapest live listing in the market currency.", align: "right" },
  {
    key: "volume",
    label: "7d volume",
    help: "Gross paid on this marketplace over the last 7 UTC days, in the market currency.",
    align: "right",
    className: "hidden md:table-cell",
  },
  { key: "listed", label: "Listed", help: "Live listings and their share of indexed items.", align: "right" },
  { key: "items", label: "Items", align: "right", className: "hidden sm:table-cell" },
];

function toNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBigint(value: string | null | undefined) {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function compareNullable<T extends number | bigint>(a: T | null, b: T | null, direction: "asc" | "desc") {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = a < b ? -1 : a > b ? 1 : 0;
  return direction === "asc" ? result : -result;
}

export function listedShare(listed: number | null, items: number | null) {
  if (listed === null || !items) return null;
  const share = Math.min(100, (listed / items) * 100);
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
}

/**
 * Ranked table of collections: floor, 7-day volume, listed share and supply,
 * sortable by column, each row opening the collection. Volume comes from one
 * statistics request per collection, cached and shared with the collection page.
 */
export function CollectionsTable({ collections, currency, isLoading = false }: CollectionsTableProps) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ key: "rank", direction: "asc" });
  const statsQueries = useQueries({
    queries: collections.map((collection) => ({
      queryKey: ["owned", "stats", collection.address, 7, currency],
      queryFn: () =>
        marketplaceRequest<CollectionStats>(`/collections/${collection.address}/stats`, {
          days: 7,
          currency,
        }),
      staleTime: 30_000,
    })),
  });
  const statsByAddress = useMemo(() => {
    const map = new Map<string, { volume: bigint | null; sales: number; pending: boolean }>();
    collections.forEach((collection, index) => {
      const query = statsQueries[index];
      const series = query?.data?.byCurrency.find((entry) => sameCurrency(entry.currency, currency));
      map.set(collection.address, {
        volume: series ? toBigint(series.volume) : query?.isSuccess ? 0n : null,
        sales: series?.sales ?? 0,
        pending: !!query?.isPending,
      });
    });
    return map;
  }, [collections, statsQueries, currency]);

  const rows = useMemo(() => {
    const indexed = collections.map((collection, index) => ({ collection, index }));
    if (sort.key === "rank") {
      return sort.direction === "asc" ? indexed : [...indexed].reverse();
    }
    return [...indexed].sort((a, b) => {
      switch (sort.key) {
        case "floor":
          return compareNullable(toBigint(a.collection.floorRaw), toBigint(b.collection.floorRaw), sort.direction);
        case "volume":
          return compareNullable(
            statsByAddress.get(a.collection.address)?.volume ?? null,
            statsByAddress.get(b.collection.address)?.volume ?? null,
            sort.direction,
          );
        case "listed":
          return compareNullable(toNumber(a.collection.listingCount), toNumber(b.collection.listingCount), sort.direction);
        case "items":
          return compareNullable(toNumber(a.collection.totalSupply), toNumber(b.collection.totalSupply), sort.direction);
        default:
          return 0;
      }
    });
  }, [collections, sort, statsByAddress]);

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current.key !== key) {
        return { key, direction: key === "rank" ? "asc" : "desc" };
      }
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="realm-panel overflow-hidden" data-testid="collections-table">
      {isLoading && <span role="status" className="sr-only">Loading collections</span>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--realm-border-etched)] text-xs text-muted-foreground">
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(
                    "whitespace-nowrap px-2 py-1.5 sm:px-3 font-medium",
                    column.align === "right" ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {/* Offset the button's own padding so the label lines up with the cell content below. */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5",
                      column.align === "right" ? "-mr-1 justify-end" : "-ml-1",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1 rounded-md px-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "text-foreground",
                      )}
                    >
                      {column.label}
                      <Icon aria-hidden className="size-3" />
                      <span className="sr-only">
                        {active ? `, sorted ${sort.direction === "asc" ? "ascending" : "descending"}` : ", sortable"}
                      </span>
                    </button>
                    {column.help ? <InfoTip label={`About ${column.label.toLowerCase()}`} text={column.help} /> : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-[color:var(--realm-border-etched)]/60 last:border-b-0">
                  <td className="w-full max-w-0 px-2 py-3 sm:px-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 shrink-0 sm:size-11" />
                      <Skeleton className="h-4 w-16 sm:w-40" />
                    </div>
                  </td>
                  {COLUMNS.slice(1).map(column => <td key={column.key} className={cn("px-2 py-3 sm:px-3", column.className)}><Skeleton className="ml-auto h-4 w-10 sm:w-16" /></td>)}
                </tr>
              ))
            : rows.map(({ collection, index }) => {
                const href = `/collections/${collection.address}`;
                const listed = toNumber(collection.listingCount);
                const items = toNumber(collection.totalSupply);
                const share = listedShare(listed, items);
                const stats = statsByAddress.get(collection.address);
                return (
                  <tr
                    key={collection.address}
                    data-collection-row
                    onClick={() => router.push(href)}
                    className="group cursor-pointer border-b border-[color:var(--realm-border-etched)]/60 transition-colors last:border-b-0 hover:bg-primary/5 has-[a:focus-visible]:bg-primary/5"
                  >
                    <td className="w-full max-w-0 px-2 py-2.5 sm:px-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="hidden w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                          {index + 1}
                        </span>
                        <span className="size-9 shrink-0 overflow-hidden sm:size-11 rounded-md border border-[color:var(--realm-border-etched)] bg-muted">
                          <TokenMedia alt="" sources={collection.imageUrl ? [collection.imageUrl] : []} fallbackLabel="" />
                        </span>
                        <Link
                          href={href}
                          className="realm-title min-w-0 truncate rounded text-base transition-colors group-hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {collection.name}
                          {collection.verified ? (
                            <BadgeCheck aria-label="Verified collection" className="ml-1 inline size-4 text-primary" />
                          ) : null}
                        </Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 sm:px-3 text-right tabular-nums">
                      {collection.floorPrice ? (
                        <span className="inline-flex items-center gap-1 font-medium">
                          {collection.floorPrice}
                          {/* Phones show the currency icon only; the symbol stays available to screen readers. */}
                          <TokenSymbol
                            address={currency}
                            className="text-muted-foreground [&>span:last-child]:sr-only sm:[&>span:last-child]:not-sr-only"
                          />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2.5 sm:px-3 text-right tabular-nums md:table-cell">
                      {stats?.pending ? (
                        <span role="status" aria-label="Loading volume"><Skeleton className="ml-auto h-4 w-16" /></span>
                      ) : stats?.volume ? (
                        <span className="inline-flex flex-col items-end">
                          <span className="inline-flex items-center gap-1 font-medium">
                            {formatCurrencyAmount(stats.volume, currency)}
                            <TokenSymbol address={currency} className="text-muted-foreground" />
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {stats.sales} sale{stats.sales === 1 ? "" : "s"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No sales</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 sm:px-3 text-right tabular-nums">
                      {listed === null ? "—" : listed}
                      {share ? <span className="hidden text-muted-foreground sm:inline"> ({share})</span> : null}
                    </td>
                    <td className="hidden px-2 py-2.5 sm:px-3 text-right tabular-nums sm:table-cell">{items ?? "—"}</td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!isLoading && rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No collections to show.</p>
      ) : null}
    </div>
  );
}
