"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, HandCoins, Layers, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/marketplace/section-header";
import { ListSkeleton } from "@/components/marketplace/loading-state";
import { MarketPrice } from "@/components/marketplace/market-price";
import { OrderComposer } from "@/features/trading/order-composer";
import { useCollectionOffersQuery } from "@/lib/marketplace/market-data";
import { formatAddress, formatRelativeExpiry } from "@/lib/marketplace/token-display";
import type { ApiOrder } from "@/lib/marketplace/types";

const PAGE_SIZE = 25;
const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary";

function OfferRow({ address, order }: { address: string; order: ApiOrder }) {
  const collectionWide = order.kind === "collection_offer";
  return (
    <li className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-lg font-semibold leading-7 text-primary">
          <MarketPrice amount={order.buyerDebit} currency={order.currency} />
        </p>
        <Badge variant="outline" className="gap-1.5">
          {collectionWide ? (
            <Layers aria-hidden className="size-3" />
          ) : (
            <HandCoins aria-hidden className="size-3" />
          )}
          {collectionWide ? "Collection offer" : "Token offer"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
        {order.tokenId != null && (
          <Link
            className={`${LINK_CLASS} font-mono text-primary`}
            href={`/collections/${address}/${order.tokenId}`}
          >
            #{order.tokenId}
          </Link>
        )}
        <span className="flex items-center gap-1.5">
          From
          <Link
            className={`${LINK_CLASS} font-mono text-foreground`}
            href={`/profile/${order.maker}`}
            title={order.maker}
          >
            {formatAddress(order.maker)}
          </Link>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 aria-hidden className="size-3" />
          {formatRelativeExpiry(Number(order.expiry))}
        </span>
        {order.availability === "funding_unchecked" && (
          <span>Funding is checked at acceptance</span>
        )}
      </div>
    </li>
  );
}

export function CollectionOffersPanel({
  address,
  currency,
}: {
  address: string;
  currency?: string;
}) {
  const titleId = useId();
  const composerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [composing, setComposing] = useState(false);
  const query = useCollectionOffersQuery(address, { currency, limit: PAGE_SIZE });
  const orders = query.data?.pages.flatMap((page) => page.items) ?? [];

  function closeComposer() {
    setComposing(false);
    toggleRef.current?.focus();
  }

  return (
    <section aria-labelledby={titleId} className="realm-panel space-y-4 p-4 sm:p-5">
      <SectionHeader
        id={titleId}
        title="Offers"
        // The total is only known once every page is loaded; until then the count reads "12+".
        count={query.data ? (query.hasNextPage ? `${orders.length}+` : orders.length) : undefined}
        description="Offer funds stay in the bidder's wallet and are checked again before acceptance."
        action={
          <Button
            ref={toggleRef}
            type="button"
            variant={composing ? "secondary" : "default"}
            className="min-h-11"
            aria-expanded={composing}
            aria-controls={composerId}
            onClick={() => setComposing((open) => !open)}
          >
            Make collection offer
          </Button>
        }
      />

      <div id={composerId}>
        {composing && (
          <div className="space-y-3 rounded-lg border border-[color:var(--realm-border-etched)] p-4">
            <div className="flex justify-end">
              <Button type="button" variant="ghost" className="min-h-11" onClick={closeComposer}>
                <X aria-hidden />
                Close
              </Button>
            </div>
            <OrderComposer collection={address} kind="collection_offer" />
          </div>
        )}
      </div>

      {query.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p role="alert" className="text-sm text-muted-foreground">
            Offers are unavailable. Please try again.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isPending ? (
        <ListSkeleton label="Loading offers" />
      ) : orders.length > 0 ? (
        <ul
          className="divide-y divide-[color:var(--realm-border-etched)] border-t border-[color:var(--realm-border-etched)] pt-3"
          aria-label="Open offers"
        >
          {orders.map((order) => (
            <OfferRow key={order.id} address={address} order={order} />
          ))}
        </ul>
      ) : (
        !query.isError && (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed px-5 py-8 text-center">
            <HandCoins aria-hidden className="mb-1 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No open offers. Be the first to make one.</p>
          </div>
        )
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading more…" : "Load more"}
        </Button>
      )}
    </section>
  );
}
