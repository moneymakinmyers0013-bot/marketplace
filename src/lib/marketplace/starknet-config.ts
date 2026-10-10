import { DeferredControllerConnector } from "./deferred-controller";
import { mainnet, sepolia } from "@starknet-react/chains";
import {
  braavos,
  cartridge,
  jsonRpcProvider,
  ready,
} from "@starknet-react/core";
import type { MarketplaceRuntimeConfig } from "@/lib/marketplace/config";

const controllers = new Map<string, DeferredControllerConnector>();
export function buildStarknetConfig(
  chainLabel: MarketplaceRuntimeConfig["chainLabel"],
) {
  const chain =
    chainLabel === "SN_MAIN"
      ? mainnet
      : chainLabel === "SN_SEPOLIA" || chainLabel === "LOCAL"
        ? sepolia
        : undefined;
  const nodeUrl =
    process.env.NEXT_PUBLIC_STARKNET_RPC_URL ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/marketplace/rpc`
      : `${process.env.MARKETPLACE_API_URL ?? "http://127.0.0.1:3100"}/rpc`);
  const defaultChainId = chain
    ? (`0x${chain.id.toString(16)}` as `0x${string}`)
    : undefined;
  const key = `${defaultChainId}:${nodeUrl}`;
  let controller = controllers.get(key);
  if (!controller) {
    // Controller owns its wallet transport. Custom RPC configuration performs synchronous
    // network I/O in this SDK constructor and would break browsing during an outage.
    controller = new DeferredControllerConnector(async () => {
      const { ControllerConnector } = await import("@cartridge/connector");
      return new ControllerConnector({ defaultChainId });
    });
    controllers.set(key, controller);
  }
  return {
    chains: chain ? [chain] : [mainnet, sepolia],
    // A single backend RPC belongs to one network; never expose it as both.
    provider: jsonRpcProvider({
      rpc: (requested) =>
        !chain || requested.id === chain.id ? { nodeUrl } : null,
    }),
    explorer: cartridge,
    connectors: [controller, ready(), braavos()],
    defaultChainId: chain?.id,
    autoConnect: true,
  };
}
