"use client";

import { useId, type ReactNode } from "react";
import type { DiscoveryCollection, DiscoveryHolding, DiscoveryPage, DiscoveryStatus, DiscoveryToken } from "@biblio/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DiscoveryViewKind = "collections" | "tokens" | "holdings";
export type DiscoverySearch = { q: string; collection: string; account: string };
export type DiscoveryResults =
  | { kind: "collections"; page?: DiscoveryPage<DiscoveryCollection> }
  | { kind: "tokens"; page?: DiscoveryPage<DiscoveryToken> }
  | { kind: "holdings"; page?: DiscoveryPage<DiscoveryHolding> };
export type DiscoveryViewProps = {
  results: DiscoveryResults;
  search: DiscoverySearch;
  status?: DiscoveryStatus;
  statusError?: boolean;
  loading?: boolean;
  refreshing?: boolean;
  awaitingInput?: boolean;
  error?: { kind: "error" | "unsupported" | "input"; message: string };
  hasPrevious?: boolean;
  onViewChange: (view: DiscoveryViewKind, collection?: string) => void;
  onSearchChange: (search: Partial<DiscoverySearch>) => void;
  onSearch: () => void;
  onNext: () => void;
  onReset: () => void;
  onRetry: () => void;
};

const exactValue = "min-w-0 break-all font-mono text-xs leading-5";
const labels = { collections: "Collections", tokens: "Tokens", holdings: "Account holdings" };

function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">{children}</dl>;
}

function CollectionRecord({ item, onBrowse }: { item: DiscoveryCollection; onBrowse: () => void }) {
  return (
    <li className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-border px-2 py-1">{item.standard === "erc721" ? "ERC-721" : "ERC-1155"}</span>
        <span>{item.verified ? "Address verified" : "Address unverified"}</span>
      </div>
      <h3 className={exactValue}>{item.name}</h3>
      {item.name !== item.address && <p className={exactValue}>{item.address}</p>}
      <Fields>
        <dt className="text-muted-foreground">Observed tokens</dt><dd className={exactValue}>{item.tokenCount}</dd>
        <dt className="text-muted-foreground">Source status</dt><dd className="break-all">{item.status}</dd>
        <dt className="text-muted-foreground">Indexed block</dt><dd className={exactValue}>{item.checkpoint ? String(item.checkpoint.number) : "Not replayed"}</dd>
        <dt className="text-muted-foreground">Reconciliation</dt><dd className="break-all">{item.coverage.reconciliation === "not_run" ? "Not run" : item.coverage.reconciliation}</dd>
      </Fields>
      <p className="text-xs text-muted-foreground">Incomplete history · Browse only</p>
      <Button variant="outline" className="min-h-11 w-full whitespace-normal" onClick={onBrowse}>Browse indexed tokens</Button>
    </li>
  );
}

function TokenRecord({ item }: { item: DiscoveryToken }) {
  return (
    <li className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{item.standard === "ERC721" ? "ERC-721" : "ERC-1155"}</span>
        <span>{item.metadataStatus === "ready" ? "Metadata cached" : item.metadataStatus === "failed" ? "Metadata unavailable" : "Metadata pending"}</span>
      </div>
      <h3 className="break-words font-medium">{item.metadata.name || "Indexed token"}</h3>
      <Fields>
        <dt className="text-muted-foreground">Token ID</dt><dd className={exactValue}>{item.tokenId}</dd>
        <dt className="text-muted-foreground">Collection</dt><dd className={exactValue}>{item.collection}</dd>
        <dt className="text-muted-foreground">Observed supply</dt><dd className={exactValue}>{item.supply}</dd>
        {item.owner && <><dt className="text-muted-foreground">Observed owner</dt><dd className={exactValue}>{item.owner}</dd></>}
      </Fields>
      {item.metadata.description && <p className="break-words text-sm text-muted-foreground">{item.metadata.description}</p>}
      <p className="text-xs text-muted-foreground">Inventory completeness is unproven. Browse only.</p>
    </li>
  );
}

function HoldingRecord({ item }: { item: DiscoveryHolding }) {
  return (
    <li className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{item.standard === "ERC721" ? "ERC-721" : "ERC-1155"} holding</h3>
      <Fields>
        <dt className="text-muted-foreground">Token ID</dt><dd className={exactValue}>{item.tokenId}</dd>
        <dt className="text-muted-foreground">Collection</dt><dd className={exactValue}>{item.collection}</dd>
        <dt className="text-muted-foreground">Account</dt><dd className={exactValue}>{item.account}</dd>
        <dt className="text-muted-foreground">Observed balance</dt><dd className={exactValue}>{item.balance}</dd>
      </Fields>
      <p className="text-xs text-muted-foreground">Balances have not been reconciled. Browse only.</p>
    </li>
  );
}

function CoverageStatus({ status, error }: { status?: DiscoveryStatus; error?: boolean }) {
  return (
    <details className="min-w-0 rounded-lg border border-border bg-card">
      <summary className="min-h-11 cursor-pointer rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"><h2 className="inline">Discovery coverage and checkpoint</h2></summary>
      <div className="min-w-0 space-y-4 px-4 pb-4">
        {!status ? <p className="text-sm text-muted-foreground">{error ? "Coverage status unavailable. Completeness remains unproven." : "Checking discovery coverage…"}</p> : <>
          <Fields>
            <dt className="text-muted-foreground">Network</dt><dd className="break-all">{status.chain}</dd>
            <dt className="text-muted-foreground">Indexed block</dt><dd className={exactValue}>{status.checkpoint?.number ?? "No checkpoint yet"}</dd>
            <dt className="text-muted-foreground">Block hash</dt><dd className={exactValue}>{status.checkpoint?.hash ?? "Unavailable"}</dd>
            <dt className="text-muted-foreground">Generation</dt><dd className={exactValue}>{status.identity?.generation ?? "Unavailable"}</dd>
          </Fields>
          <p className="text-sm text-muted-foreground">Historical coverage is incomplete. Token completeness is unproven. No collection here is enabled for settlement.</p>
          {status.counts.length > 0 && <div><h3 className="mb-2 text-sm font-medium">Discovered sources by status</h3><Fields>{status.counts.map(item => <div className="contents" key={item.status}><dt className="break-all text-muted-foreground">{item.status}</dt><dd className={exactValue}>{item.count}</dd></div>)}</Fields></div>}
          {status.metadata.length > 0 && <div><h3 className="mb-2 text-sm font-medium">Metadata cache</h3><Fields>{status.metadata.map(item => <div className="contents" key={item.status}><dt className="break-all text-muted-foreground">{item.status}</dt><dd className={exactValue}>{item.count}</dd></div>)}</Fields></div>}
          <div><h3 className="mb-2 text-sm font-medium">Reported acquisition gaps</h3>{status.gaps.length ? <ul className="space-y-2 text-sm">{status.gaps.map(gap => <li className="break-words" key={`${gap.from_block}:${gap.to_block}:${gap.reason}`}><span className={exactValue}>{gap.from_block}–{gap.to_block}</span>: {gap.reason}</li>)}</ul> : <p className="text-sm text-muted-foreground">No gaps reported. This does not establish complete token history.</p>}</div>
        </>}
      </div>
    </details>
  );
}

/** Controlled presentation: the route owns queries, URL state and pagination. */
export function DiscoveryView({ results, search, status, statusError, loading = false, refreshing = false, awaitingInput = false, error, hasPrevious = false, onViewChange, onSearchChange, onSearch, onNext, onReset, onRetry }: DiscoveryViewProps) {
  const id = useId();
  const count = results.page?.items.length;
  const isBusy = loading || refreshing;
  const empty = { collections: "No indexed collections match this address.", tokens: "No indexed tokens are available for this collection.", holdings: "No indexed holdings are available for this account." };
  return (
    <section aria-labelledby={`${id}-heading`} className="mx-auto w-full max-w-6xl min-w-0 space-y-5">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-primary">Browse only</p>
        <h1 id={`${id}-heading`} className="text-3xl font-semibold">Starknet NFT discovery</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Explore published observations from the NFT index. Historical coverage is incomplete; token inventory and account balances have not been reconciled. These records are not enabled for trading.</p>
      </header>
      <CoverageStatus status={status} error={statusError} />
      <div role="group" aria-label="Discovery views" className="flex flex-wrap gap-2">
        {(Object.keys(labels) as DiscoveryViewKind[]).map(view => <Button key={view} variant={results.kind === view ? "secondary" : "outline"} aria-pressed={results.kind === view} className="min-h-11 whitespace-normal" onClick={() => onViewChange(view)}>{labels[view]}</Button>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); onSearch(); }} className="flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        {results.kind === "collections" ? <div className="min-w-0 flex-1 basis-60 space-y-2"><label htmlFor={`${id}-q`} className="text-sm font-medium">Search contract address</label><Input id={`${id}-q`} value={search.q} maxLength={100} autoComplete="off" spellCheck={false} className="min-h-11" placeholder="0x… or part of an address" onChange={event => onSearchChange({ q: event.target.value })} /></div> : <>
          {results.kind === "holdings" && <div className="min-w-0 flex-1 basis-60 space-y-2"><label htmlFor={`${id}-account`} className="text-sm font-medium">Account address</label><Input id={`${id}-account`} value={search.account} maxLength={66} autoComplete="off" spellCheck={false} className="min-h-11" placeholder="0x…" onChange={event => onSearchChange({ account: event.target.value })} /></div>}
          <div className="min-w-0 flex-1 basis-60 space-y-2"><label htmlFor={`${id}-collection`} className="text-sm font-medium">{results.kind === "holdings" ? "Collection address (optional)" : "Collection address"}</label><Input id={`${id}-collection`} value={search.collection} maxLength={66} autoComplete="off" spellCheck={false} className="min-h-11" placeholder="0x…" onChange={event => onSearchChange({ collection: event.target.value })} /></div>
        </>}
        <Button type="submit" className="min-h-11 whitespace-normal">{results.kind === "collections" ? "Search collections" : results.kind === "tokens" ? "Load tokens" : "Load holdings"}</Button>
      </form>
      <div aria-busy={isBusy} className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{labels[results.kind]}</h2>
          <Button variant="ghost" className="min-h-11" disabled={isBusy || awaitingInput} onClick={onRetry}>Refresh discovery</Button>
        </div>
        <p role="status" className="text-sm text-muted-foreground">{loading && !results.page ? "Loading indexed observations…" : refreshing ? "Refreshing indexed observations…" : count !== undefined ? `${count} indexed ${count === 1 ? "record" : "records"} on this page${results.page?.nextCursor ? ", more available" : ""}.` : awaitingInput ? "Enter an address to browse indexed observations." : "Discovery results unavailable."}</p>
        {error && <div role="alert" className="space-y-3 rounded-lg border border-border p-4"><h3 className="font-medium">{error.kind === "unsupported" ? "Collection unavailable" : error.kind === "input" ? "Check the address" : "Discovery could not be loaded"}</h3><p className="break-words text-sm text-muted-foreground">{error.message}</p>{error.kind !== "input" && <div className="flex flex-wrap gap-3"><Button variant="outline" className="min-h-11 whitespace-normal" disabled={isBusy} onClick={onRetry}>Retry discovery</Button>{hasPrevious && <Button variant="outline" className="min-h-11 whitespace-normal" disabled={isBusy} onClick={onReset}>Return to first page</Button>}</div>}</div>}
        {!loading && !error && count === 0 && <p className="rounded-lg border border-border p-5 text-sm text-muted-foreground">{empty[results.kind]} Missing records do not prove that a collection or account has no NFTs.</p>}
        {!!count && <ul aria-label={`Indexed ${labels[results.kind].toLowerCase()}`} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.kind === "collections" && results.page?.items.map(item => <CollectionRecord key={`${item.chain}:${item.address}`} item={item} onBrowse={() => onViewChange("tokens", item.address)} />)}
          {results.kind === "tokens" && results.page?.items.map(item => <TokenRecord key={`${item.collection}:${item.tokenId}`} item={item} />)}
          {results.kind === "holdings" && results.page?.items.map(item => <HoldingRecord key={`${item.account}:${item.collection}:${item.tokenId}`} item={item} />)}
        </ul>}
        {results.page && <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4"><Button variant="outline" className="min-h-11" disabled={isBusy || !hasPrevious} onClick={onReset}>First page</Button><Button variant="outline" className="min-h-11" disabled={isBusy || !results.page.nextCursor} onClick={onNext}>Next page</Button><span className="text-xs text-muted-foreground">Observed records · Incomplete coverage</span></div>}
      </div>
    </section>
  );
}
