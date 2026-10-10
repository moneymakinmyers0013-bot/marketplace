import type { DiscoveryCollection, DiscoveryHolding, DiscoveryPage, DiscoveryStatus, DiscoveryToken } from "@biblio/marketplace";

export const exampleCollection = `0x${"7".repeat(63)}`;
export const exampleAccount = `0x${"2".repeat(63)}`;
const largeId = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const page = { nextCursor: "opaque-example-cursor", chain: "SN_MAIN", generation: "9007199254740993", settlementEligible: false, tokenCoverage: "unproven" } as const;
export const collectionPage: DiscoveryPage<DiscoveryCollection> = {
  ...page,
  items: [
    { address: exampleCollection, name: exampleCollection, chain: "SN_MAIN", standard: "erc721", status: "supported", verified: false, settlementEligible: false, checkpoint: { number: 16093977, hash: "0xabc123" }, coverage: { historicalComplete: false, reconciliation: "not_run" }, tokenCount: "9007199254740993" },
    { address: `0x${"a".repeat(63)}`, name: `0x${"a".repeat(63)}`, chain: "SN_MAIN", standard: "erc1155", status: "supported", verified: true, settlementEligible: false, checkpoint: null, coverage: { historicalComplete: false, reconciliation: "not_run" }, tokenCount: "12" },
  ],
};
export const tokenPage: DiscoveryPage<DiscoveryToken> = {
  ...page,
  items: [
    { id: `${exampleCollection}:${largeId}`, collection: exampleCollection, standard: "ERC721", tokenId: largeId, owner: exampleAccount, supply: "1", metadata: { name: "An indexed token with a long metadata name that wraps across narrow screens", description: "Metadata is cached independently of token coverage." }, metadataStatus: "ready", metadataObservedAt: 1791500000000, settlementEligible: false },
    { id: `${exampleCollection}:9007199254740993`, collection: exampleCollection, standard: "ERC1155", tokenId: "9007199254740993", supply: "340282366920938463463374607431768211455", metadata: {}, metadataStatus: "pending", metadataObservedAt: null, settlementEligible: false },
    { id: `${exampleCollection}:3`, collection: exampleCollection, standard: "ERC721", tokenId: "3", owner: exampleAccount, supply: "1", metadata: {}, metadataStatus: "failed", metadataObservedAt: null, settlementEligible: false },
  ],
};
export const holdingPage: DiscoveryPage<DiscoveryHolding> = {
  ...page,
  items: [{ id: `${exampleCollection}:${largeId}:${exampleAccount}`, collection: exampleCollection, standard: "ERC1155", tokenId: largeId, account: exampleAccount, balance: "340282366920938463463374607431768211455", settlementEligible: false }],
};
export const discoveryStatus: DiscoveryStatus = {
  chain: "SN_MAIN", identity: { chain: "SN_MAIN", chain_id: "0x534e5f4d41494e", coverage_start: "16093000", generation: page.generation },
  checkpoint: { number: "16093977", hash: "0xabc123" }, counts: [{ status: "supported", count: "12" }, { status: "unsupported", count: "8" }],
  gaps: [{ from_block: "16093100", to_block: "16093200", reason: "RPC range awaiting retry", retryable: true }], metadata: [{ status: "ready", count: "4" }, { status: "pending", count: "15" }],
  settlementEligible: false, tokenCoverage: "unproven", historicalComplete: false,
};
