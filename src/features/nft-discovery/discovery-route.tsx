"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MarketplaceApiError } from "@biblio/marketplace";
import { useClientQuery, useMarketplace } from "@biblio/marketplace-react";
import { DiscoveryView, type DiscoveryResults, type DiscoveryViewProps } from "./discovery-view";
import { discoveryInputError, discoveryStateFromParams, discoveryStateToParams, type DiscoveryState } from "./discovery-state";

function DiscoverySession({ state, params }: { state: DiscoveryState; params: URLSearchParams }) {
  const client = useMarketplace();
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(state.search);
  const [validationError, setValidationError] = useState<string>();
  const awaitingInput = state.view === "tokens" ? !state.search.collection : state.view === "holdings" ? !state.search.account : false;
  const inputError = !awaitingInput ? discoveryInputError(state.view, state.search) : undefined;
  const enabled = !awaitingInput && !inputError;
  const options = { limit: 20, ...(state.cursor ? { cursor: state.cursor } : {}) };
  const collections = useClientQuery(client, {
    queryKey: ["discovery", "collections", state.search.q, state.cursor],
    queryFn: () => client.discovery.collections({ ...options, q: state.search.q }),
    enabled: state.view === "collections", retry: false,
  });
  const tokens = useClientQuery(client, {
    queryKey: ["discovery", "tokens", state.search.collection, state.cursor],
    queryFn: () => client.discovery.tokens(state.search.collection, options),
    enabled: state.view === "tokens" && enabled, retry: false,
  });
  const holdings = useClientQuery(client, {
    queryKey: ["discovery", "holdings", state.search.account, state.search.collection, state.cursor],
    queryFn: () => client.discovery.holdings(state.search.account, { ...options, ...(state.search.collection ? { collection: state.search.collection } : {}) }),
    enabled: state.view === "holdings" && enabled, retry: false,
  });
  const status = useClientQuery(client, { queryKey: ["discovery", "status"], queryFn: () => client.discovery.status(), retry: false });
  const query = state.view === "collections" ? collections : state.view === "tokens" ? tokens : holdings;
  const results: DiscoveryResults = state.view === "collections" ? { kind: "collections", page: collections.data } : state.view === "tokens" ? { kind: "tokens", page: tokens.data } : { kind: "holdings", page: holdings.data };
  const error: DiscoveryViewProps["error"] = validationError || inputError ? { kind: "input", message: validationError || inputError! } : query.isError ? query.error instanceof MarketplaceApiError && query.error.code === "NOT_FOUND" && state.view === "tokens" ? { kind: "unsupported", message: "This collection is not published in discovery. It may be unsupported or awaiting review." } : { kind: "error", message: query.error instanceof MarketplaceApiError && query.error.code === "CURSOR_MISMATCH" ? "This page expired after an index update. Return to the first page to continue." : "The discovery service could not return these observations. Retry to check again." } : undefined;
  const navigate = (next: DiscoveryState) => {
    const nextParams = discoveryStateToParams(params, next);
    router.push(`${pathname}${nextParams.size ? `?${nextParams}` : ""}`, { scroll: false });
  };
  return <DiscoveryView
    results={results} search={draft} status={status.data} statusError={status.isError}
    loading={enabled && query.isPending} refreshing={query.isFetching && !query.isPending}
    awaitingInput={awaitingInput} error={error} hasPrevious={!!state.cursor}
    onSearchChange={change => { setDraft(current => ({ ...current, ...change })); setValidationError(undefined); }}
    onSearch={() => {
      const message = discoveryInputError(state.view, draft);
      if (message) { setValidationError(message); return; }
      navigate({ ...state, search: draft, cursor: undefined });
    }}
    onViewChange={(view, collection) => navigate({ view, search: { q: "", collection: collection ?? "", account: "" } })}
    onNext={() => { if (query.data?.nextCursor) navigate({ ...state, cursor: query.data.nextCursor }); }}
    onReset={() => navigate({ ...state, cursor: undefined })}
    onRetry={() => {
      if (query.error instanceof MarketplaceApiError && query.error.code === "CURSOR_MISMATCH") navigate({ ...state, cursor: undefined });
      else if (enabled) void query.refetch();
      void status.refetch();
    }}
  />;
}

export function DiscoveryRoute() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  return <DiscoverySession key={params.toString()} state={discoveryStateFromParams(params)} params={params} />;
}
