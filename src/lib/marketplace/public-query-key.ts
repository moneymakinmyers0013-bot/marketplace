import { getMarketplaceRuntimeConfig } from "./config";

/** Public view-model identity is shared by SSR and browser, never the private API origin. */
export function publicQueryKey(key: readonly unknown[]) {
  const runtime = getMarketplaceRuntimeConfig();
  return ["public-market", process.env.NEXT_PUBLIC_MARKETPLACE_API_BASE ?? "/api/marketplace",
    runtime.chainLabel, runtime.sdkConfig?.chainId ?? "0x1",
    process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? "read-only", ...key] as const;
}
