import type { DiscoverySearch, DiscoveryViewKind } from "./discovery-view";

export type DiscoveryState = { view: DiscoveryViewKind; search: DiscoverySearch; cursor?: string };

export function discoveryStateFromParams(params: URLSearchParams): DiscoveryState {
  const rawView = params.get("view");
  const view = rawView === "tokens" || rawView === "holdings" ? rawView : "collections";
  return {
    view,
    search: {
      q: view === "collections" ? (params.get("q") ?? "").trim().slice(0, 100) : "",
      collection: view !== "collections" ? (params.get("collection") ?? "").trim() : "",
      account: view === "holdings" ? (params.get("account") ?? "").trim() : "",
    },
    cursor: params.get("cursor") || undefined,
  };
}

export function discoveryStateToParams(current: URLSearchParams, state: DiscoveryState) {
  const params = new URLSearchParams(current);
  for (const key of ["view", "q", "collection", "account", "cursor"]) params.delete(key);
  if (state.view !== "collections") params.set("view", state.view);
  if (state.view === "collections" && state.search.q.trim()) params.set("q", state.search.q.trim().slice(0, 100));
  if (state.view !== "collections" && state.search.collection.trim()) params.set("collection", state.search.collection.trim());
  if (state.view === "holdings" && state.search.account.trim()) params.set("account", state.search.account.trim());
  if (state.cursor) params.set("cursor", state.cursor);
  return params;
}

export function validDiscoveryAddress(value: string) {
  if (!/^0x[0-9a-f]{1,64}$/i.test(value)) return false;
  const felt = BigInt(value);
  return felt > 0n && felt < 2n ** 251n + 17n * 2n ** 192n + 1n;
}

export function discoveryInputError(view: DiscoveryViewKind, search: DiscoverySearch) {
  if (view === "tokens" && !validDiscoveryAddress(search.collection)) return "Enter a valid Starknet collection address.";
  if (view === "holdings" && !validDiscoveryAddress(search.account)) return "Enter a valid Starknet account address.";
  if (view === "holdings" && search.collection && !validDiscoveryAddress(search.collection)) return "Enter a valid Starknet collection address or leave it empty.";
  return undefined;
}
