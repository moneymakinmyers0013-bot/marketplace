import Link from "next/link";
import { MarketPrice } from "@/components/marketplace/market-price";
import { buildExplorerTxUrl } from "@/lib/marketplace/token-display";
export type TokenActivityItem = {
  id: string;
  type: string;
  kind?: string;
  buyerDebit?: string;
  currency?: string;
  buyer?: string;
  seller?: string;
  maker?: string;
  from?: string;
  to?: string;
  provenance: { timestamp: number; transactionHash?: string };
};
function eventLabel(a: TokenActivityItem) {
  if (a.type === "order_filled") return "Sale";
  if (a.type === "order_created")
    return a.kind === "listing" ? "Listed" : "Offer made";
  if (a.type === "order_cancelled") return "Order cancelled";
  if (a.type === "transfer") return "Transfer";
  return a.type.replaceAll("_", " ");
}
function Participant({ label, address }: { label: string; address?: string }) {
  if (!address) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {BigInt(address) === 0n ? (
        <span className="text-foreground">Mint / burn</span>
      ) : (
        <Link
          className="rounded font-mono text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/profile/${address}`}
          title={address}
        >
          {address.length > 14
            ? `${address.slice(0, 6)}…${address.slice(-4)}`
            : address}
        </Link>
      )}
    </span>
  );
}
/** One event per row: label, participants and provenance, price right-aligned on md+. */
export function TokenActivity({
  items,
  chain,
}: {
  items: TokenActivityItem[];
  chain: string;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {items.map((a) => (
        <li
          key={a.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0 md:flex md:gap-4"
        >
          <strong className="font-medium md:w-28 md:shrink-0">{eventLabel(a)}</strong>
          <span className="text-right font-medium tabular-nums md:order-last md:ml-auto md:shrink-0">
            {a.buyerDebit ? (
              <MarketPrice amount={a.buyerDebit} currency={a.currency} />
            ) : null}
          </span>
          <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:col-auto md:flex-1">
            <Participant label="Buyer" address={a.buyer} />
            <Participant label="Seller" address={a.seller} />
            <Participant label="Maker" address={a.maker} />
            <Participant label="From" address={a.from} />
            <Participant label="To" address={a.to} />
            <time
              className="font-mono"
              dateTime={new Date(a.provenance.timestamp * 1000).toISOString()}
            >
              {new Date(a.provenance.timestamp * 1000).toLocaleString()}
            </time>
            {a.provenance.transactionHash &&
              ["SN_MAIN", "SN_SEPOLIA"].includes(chain) && (
                <a
                  className="rounded text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={buildExplorerTxUrl(chain, a.provenance.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View transaction
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
          </div>
        </li>
      ))}
    </ul>
  );
}
