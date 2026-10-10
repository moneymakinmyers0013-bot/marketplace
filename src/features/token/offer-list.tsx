"use client";
import { useId, type ReactNode } from "react";
import Link from "next/link";
import { Clock3, HandCoins, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/marketplace/loading-state";
import { MarketPrice } from "@/components/marketplace/market-price";
import { SectionHeader } from "@/components/marketplace/section-header";
import { formatRelativeExpiry } from "@/lib/marketplace/token-display";
import type { ApiOrder } from "@/lib/marketplace/types";
export function OfferList({
  orders,
  loading = false,
  error = false,
  hasMore = false,
  loadingMore = false,
  onRetry,
  onMore,
  renderAction,
  children,
}: {
  orders: ApiOrder[];
  loading?: boolean;
  error?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onRetry: () => void;
  onMore: () => void;
  renderAction?: (order: ApiOrder) => ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="realm-panel space-y-4 p-4 sm:p-5"
    >
      <SectionHeader
        id={titleId}
        title="Offers"
        // While another page is available the count reads "loaded so far", e.g. "12+".
        count={orders.length > 0 ? (hasMore ? `${orders.length}+` : orders.length) : undefined}
        description="Funds stay in the bidder’s wallet and are checked again before acceptance."
      />
      {children}
      {loading && orders.length === 0 && (
        <ListSkeleton label="Loading offers" />
      )}
      {orders.length > 0 && (
        <ul
          className="divide-y divide-border/60"
          aria-label="Offers for this asset"
        >
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-lg leading-7 font-semibold text-primary">
                  <MarketPrice
                    amount={order.buyerDebit}
                    currency={order.currency}
                  />
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="gap-1.5">
                    {order.kind === "collection_offer" ? (
                      <Layers aria-hidden className="size-3" />
                    ) : (
                      <HandCoins aria-hidden className="size-3" />
                    )}
                    {order.kind === "collection_offer"
                      ? "Collection offer"
                      : "Token offer"}
                  </Badge>
                  <span>
                    From{" "}
                    <Link
                      className="rounded font-mono text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-primary"
                      href={`/profile/${order.maker}`}
                      title={order.maker}
                    >
                      {order.maker.length > 16
                        ? `${order.maker.slice(0, 8)}…${order.maker.slice(-6)}`
                        : order.maker}
                    </Link>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 aria-hidden className="size-3" />
                    {formatRelativeExpiry(Number(order.expiry))}
                  </span>
                </div>
              </div>
              {renderAction && (
                <div className="w-full shrink-0 sm:w-auto [&_button]:min-h-11 [&_button]:w-full sm:[&_button]:w-auto">
                  {renderAction(order)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p role="alert" className="text-sm text-muted-foreground">
            Offers are unavailable. Please try again.
          </p>
          <Button variant="outline" className="min-h-11" onClick={onRetry}>
            Retry offers
          </Button>
        </div>
      )}
      {!loading && !error && orders.length === 0 && (
        <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-5 py-8 text-center">
          <HandCoins
            aria-hidden
            className="mb-1 size-6 text-muted-foreground"
          />
          <p className="text-sm font-medium">No offers yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            New token and collection offers will appear here.
          </p>
        </div>
      )}
      {hasMore && (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={loadingMore}
          onClick={onMore}
        >
          {loadingMore ? "Loading offers…" : "Load more offers"}
        </Button>
      )}
    </section>
  );
}
