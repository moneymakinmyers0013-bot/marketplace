"use client";
import { useEffect, useState } from "react";
import { MarketplaceLink as Link } from "@/components/marketplace/marketplace-link";
import {
  Activity,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  ExternalLink,
  HandCoins,
  ShoppingBag,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/marketplace/loading-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MarketPrice } from "@/components/marketplace/market-price";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import {
  filterActivityEvents,
  useCollectionActivityQuery,
  type ActivityEvent,
  type ActivityFilter,
} from "@/lib/marketplace/market-data";
import { formatDateTime, formatRelativeTime } from "@/lib/marketplace/time-format";
import { buildExplorerTxUrl, formatAddress } from "@/lib/marketplace/token-display";

const PAGE_SIZE = 30;
const EXPLORER_CHAINS = new Set(["SN_MAIN", "SN_SEPOLIA"]);
const CLOCK_TICK_MS = 60_000;

const FILTERS: Array<{
  value: ActivityFilter;
  label: string;
  noun: string;
  hint: string;
}> = [
  {
    value: "all",
    label: "All",
    noun: "activity",
    hint: "Sales, listings, offers and transfers appear here as they are indexed.",
  },
  {
    value: "sales",
    label: "Sales",
    noun: "sales",
    hint: "Completed purchases appear here as they are indexed.",
  },
  {
    value: "listings",
    label: "Listings",
    noun: "listings",
    hint: "New listings appear here as they are indexed.",
  },
  {
    value: "offers",
    label: "Offers",
    noun: "offers",
    hint: "Token and collection offers appear here as they are indexed.",
  },
  {
    value: "transfers",
    label: "Transfers",
    noun: "transfers",
    hint: "Ownership changes, including mints, appear here as they are indexed.",
  },
];

/** One etched track, the active segment filled; see `.market-segmented` in globals.css. */
const SEGMENT_CLASS =
  "market-segment h-9 min-w-11 px-2 sm:px-3";
const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary";
const ADDRESS_CLASS =
  "inline-flex min-h-11 items-center rounded font-mono text-xs text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary";

/** A shared reference time for relative labels, refreshed once a minute so rows age consistently. */
function useNow(tickMs = CLOCK_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return now;
}

function describeEvent(event: ActivityEvent): { label: string; Icon: LucideIcon } {
  switch (event.type) {
    case "order_filled":
      return { label: "Sale", Icon: ShoppingBag };
    case "order_created":
      return event.kind === "listing"
        ? { label: "Listing", Icon: Tag }
        : { label: "Offer", Icon: HandCoins };
    case "order_cancelled":
      return { label: "Cancelled", Icon: Ban };
    case "transfer":
      return { label: "Transfer", Icon: ArrowRightLeft };
    default:
      return { label: event.type.replaceAll("_", " "), Icon: Activity };
  }
}

type Participant = { address: string; zeroLabel: string };

/** Sale: seller to buyer. Transfer: from to to. Orders: the maker. */
function participantsOf(event: ActivityEvent): Participant[] {
  const pair =
    event.type === "order_filled"
      ? [event.seller, event.buyer]
      : event.type === "transfer"
        ? [event.from, event.to]
        : [event.maker];
  return pair.flatMap((address, index) =>
    address ? [{ address, zeroLabel: index === 0 ? "Mint" : "Burn" }] : [],
  );
}

function isZeroAddress(address: string) {
  try {
    return BigInt(address) === 0n;
  } catch {
    return false;
  }
}

function EventBadge({ event }: { event: ActivityEvent }) {
  const { label, Icon } = describeEvent(event);
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}

function ItemLink({ address, tokenId }: { address: string; tokenId?: string | null }) {
  if (tokenId == null) {
    return <span className="text-muted-foreground">Collection offer</span>;
  }
  return (
    <Link className={`${LINK_CLASS} font-mono`} href={`/collections/${address}/${tokenId}`}>
      #{tokenId}
    </Link>
  );
}

function AddressLink({ address, zeroLabel }: Participant) {
  if (isZeroAddress(address)) {
    return <span>{zeroLabel}</span>;
  }
  return (
    <Link className={ADDRESS_CLASS} href={`/profile/${address}`} title={address}>
      {formatAddress(address)}
    </Link>
  );
}

function Participants({ event }: { event: ActivityEvent }) {
  const participants = participantsOf(event);
  if (participants.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      {participants.map((participant, index) => (
        <span key={`${index}-${participant.address}`} className="flex items-center gap-x-1.5">
          {index > 0 && (
            <>
              <ArrowRight aria-hidden className="size-3 text-muted-foreground" />
              <span className="sr-only">to</span>
            </>
          )}
          <AddressLink {...participant} />
        </span>
      ))}
    </span>
  );
}

function EventTime({ timestamp, now }: { timestamp: number; now: number }) {
  return (
    <time
      className="whitespace-nowrap font-mono text-xs text-muted-foreground"
      dateTime={new Date(timestamp * 1000).toISOString()}
      title={formatDateTime(timestamp)}
    >
      {formatRelativeTime(timestamp, now)}
    </time>
  );
}

function ExplorerLink({ chain, hash }: { chain: string; hash?: string }) {
  if (!hash || !EXPLORER_CHAINS.has(chain)) return null;
  return (
    <a
      className={`${LINK_CLASS} gap-1 text-xs`}
      href={buildExplorerTxUrl(chain, hash)}
      target="_blank"
      rel="noopener noreferrer"
    >
      View tx
      <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function EventPrice({ event }: { event: ActivityEvent }) {
  if (!event.buyerDebit) return null;
  return <MarketPrice amount={event.buyerDebit} currency={event.currency} />;
}

export function CollectionActivityFeed({ address }: { address: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const chain = getMarketplaceRuntimeConfig().chainLabel;
  const query = useCollectionActivityQuery(address, filter, { limit: PAGE_SIZE });
  const events = filterActivityEvents(
    query.data?.pages.flatMap((page) => page.items) ?? [],
    filter,
  );
  const active = FILTERS.find((option) => option.value === filter) ?? FILTERS[0];
  const now = useNow();

  return (
    <section aria-label="Collection activity" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Activity type"
          className="market-segmented overflow-x-auto"
        >
          {FILTERS.map((option) => {
            const pressed = option.value === filter;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={pressed}
                className={SEGMENT_CLASS}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {query.data && (
          <p className="market-label tabular-nums">
            Showing {events.length} {events.length === 1 ? "event" : "events"}
          </p>
        )}
      </div>

      {query.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p role="alert" className="text-sm text-muted-foreground">
            Activity is unavailable. Please try again.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isPending ? (
        <ListSkeleton label="Loading activity" compact />
      ) : events.length > 0 ? (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Collection activity</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="market-label h-9">Event</TableHead>
                  <TableHead className="market-label h-9">Item</TableHead>
                  <TableHead className="market-label h-9">Price</TableHead>
                  <TableHead className="market-label h-9">From/To</TableHead>
                  <TableHead className="market-label h-9">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <EventBadge event={event} />
                    </TableCell>
                    <TableCell>
                      <ItemLink address={address} tokenId={event.tokenId} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <EventPrice event={event} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Participants event={event} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-x-3">
                        <EventTime timestamp={event.provenance.timestamp} now={now} />
                        <ExplorerLink chain={chain} hash={event.provenance.transactionHash} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul
            className="divide-y divide-[color:var(--realm-border-etched)] overflow-hidden rounded-xl border border-[color:var(--realm-border-etched)] bg-muted/20 md:hidden"
            aria-label="Collection activity"
          >
            {events.map((event) => (
              <li key={event.id} className="min-w-0 px-4 pt-3 pb-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <EventBadge event={event} />
                  <EventTime timestamp={event.provenance.timestamp} now={now} />
                </div>
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
                  <ItemLink address={address} tokenId={event.tokenId} />
                  <span className="font-medium">
                    <EventPrice event={event} />
                  </span>
                </div>
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-xs">
                  <Participants event={event} />
                  <ExplorerLink chain={chain} hash={event.provenance.transactionHash} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !query.isError && (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed px-5 py-8 text-center">
            <Activity aria-hidden className="mb-1 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No {active.noun} yet.</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              {active.hint}
            </p>
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
