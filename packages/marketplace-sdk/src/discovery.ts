/** Discovery coverage and settlement eligibility are independent of the trading registry. */
export type DiscoveryCoverage = {
  historicalComplete: false;
  reconciliation: string;
  startBlock?: number;
  deploymentBlock?: number | null;
  deploymentCovered?: boolean;
  ambiguousUpgradeBlocks?: number[];
  limitation?: string;
};
export type DiscoveryCollection = {
  address: string;
  name: string;
  chain: string;
  standard: "erc721" | "erc1155";
  status: string;
  verified: boolean;
  settlementEligible: false;
  checkpoint: { number: number; hash: string } | null;
  coverage: DiscoveryCoverage;
  tokenCount: string;
};
export type DiscoveryToken = {
  id: string;
  collection: string;
  standard: "ERC721" | "ERC1155";
  tokenId: string;
  owner?: string;
  supply: string;
  settlementEligible: false;
  metadata: { name?: string | null; description?: string | null; attributes?: Array<{ name: string; value: string | number | boolean }> };
  metadataStatus: "pending" | "ready" | "failed";
  metadataObservedAt: number | null;
};
export type DiscoveryHolding = {
  id: string;
  collection: string;
  standard: "ERC721" | "ERC1155";
  tokenId: string;
  account: string;
  balance: string;
  settlementEligible: false;
};
export type DiscoveryPage<T> = {
  items: T[];
  nextCursor: string | null;
  chain: string;
  generation: string;
  settlementEligible: false;
  tokenCoverage: "unproven";
  source?: {
    block_number: string;
    block_hash: string;
    coverage: DiscoveryCoverage;
    state: string;
  } | null;
};
export type DiscoveryStatus = {
  chain: string;
  identity: { chain: string; chain_id: string; coverage_start: string; generation: string } | null;
  checkpoint: { number: string; hash: string } | null;
  counts: Array<{ status: string; count: string }>;
  gaps: Array<{ from_block: string; to_block: string; reason: string; retryable: boolean }>;
  metadata: Array<{ status: string; count: string }>;
  probe?: {
    spec?: string;
    from?: number;
    to?: number;
    hash?: string;
    headObserved?: number;
    headHash?: string;
    observedAt?: number;
    rpcCalls?: number;
    rpcBytes?: number;
  } | null;
  lagBlocks?: number | null;
  settlementEligible: false;
  tokenCoverage: "unproven";
  historicalComplete: false;
};
