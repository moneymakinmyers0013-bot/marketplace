"use client";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { HydrationBoundary, IsRestoringProvider, useQueryClient, type DehydratedState } from "@tanstack/react-query";

/** Pending RSC promises must not change the first client render's loading markup. */
export function PublicHydrationBoundary({ state, children }: { state: DehydratedState; children: ReactNode }) {
  const client = useQueryClient();
  const [restored, setRestored] = useState<DehydratedState | null>(null);
  const [ready, pending] = useMemo(() => [
    { ...state, queries: state.queries.filter(query => query.state.status !== "pending") },
    { mutations: [], queries: state.queries.filter(query => query.state.status === "pending") },
  ], [state]);
  // Pause observers until the streamed promises are installed. Otherwise a child
  // can start a duplicate request before this parent finishes restoring its cache.
  useLayoutEffect(() => {
    for (const query of pending.queries) {
      if (!query.promise || (client.getQueryState(query.queryKey)?.dataUpdatedAt ?? 0) > (query.dehydratedAt ?? 0)) continue;
      // Observers already created pending cache entries during render. Install the
      // server promise as their initial fetch through the public QueryClient API.
      void client.fetchQuery({ queryKey: query.queryKey, queryFn: () => Promise.resolve(query.promise), retry: false, staleTime: 0 }).catch(() => {});
    }
    let active = true;
    queueMicrotask(() => { if (active) setRestored(state); });
    return () => { active = false; };
  }, [client, pending, state]);
  return <IsRestoringProvider value={restored !== state}>
    <HydrationBoundary state={ready}>{children}</HydrationBoundary>
  </IsRestoringProvider>;
}
