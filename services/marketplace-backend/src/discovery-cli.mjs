import { fileURLToPath } from "node:url";
import pg from "pg";
import { RpcClient } from "./rpc.mjs";
import { address } from "./domain.mjs";
import { scanDiscovery } from "./discovery.mjs";
import { classifyDiscovery } from "./discovery-classify.mjs";
import { PgDiscoveryStore } from "./postgres/discovery.mjs";
import { replayDiscoveredSource } from "./postgres/discovery-replay.mjs";
import { refreshDiscoveryMetadata } from "./discovery-metadata.mjs";
const chains = { SN_MAIN: "0x534e5f4d41494e", SN_SEPOLIA: "0x534e5f5345504f4c4941", LOCAL: "0x4c4f43414c" };
export function parseDiscoveryArgs(argv) {
  const [command, ...rest] = argv, options = { command };
  if (!["scan", "classify", "replay", "metadata", "report"].includes(command)) throw new Error("Select scan, classify, replay, metadata or report");
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2), value = rest[i + 1];
    if (!rest[i].startsWith("--") || !["chain", "start", "stop", "window", "source", "limit"].includes(key) || key in options || value === undefined)
      throw new Error("Invalid discovery option");
    options[key] = ["start", "stop", "window", "limit"].includes(key) ? Number(value) : value;
  }
  if (!chains[options.chain]) throw new Error("Select discovery chain");
  for (const key of ["start", "stop", "window", "limit"])
    if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key] < 0)) throw new Error("Invalid discovery integer");
  if (command === "scan" && (options.start === undefined || options.stop === undefined || options.stop < options.start))
    throw new Error("Scan requires an explicit start and stop");
  if (options.window !== undefined && (options.window < 1 || options.window > 100)) throw new Error("Window must be 1–100");
  if (options.limit !== undefined && (options.limit < 1 || options.limit > 100)) throw new Error("Limit must be 1–100");
  if (command === "replay" && !options.source) throw new Error("Replay requires source");
  if (options.source) options.source = address(options.source);
  return options;
}
export async function discoveryReport(store) {
  return store.transaction(async c => {
    const chain = store.chain, identity = (await c.query("SELECT * FROM chain.nft_discovery_identity WHERE chain=$1", [chain])).rows[0] ?? null;
    const counts = (await c.query("SELECT status,count(*)::text count FROM chain.nft_catalog WHERE chain=$1 GROUP BY status ORDER BY status", [chain])).rows;
    const gaps = (await c.query("SELECT * FROM chain.nft_discovery_gaps WHERE chain=$1 ORDER BY from_block LIMIT 100", [chain])).rows;
    const sources = (await c.query("SELECT address,block_number,block_hash,generation,body->'coverage' coverage,body->>'state' state FROM chain.nft_source_projections WHERE chain=$1 ORDER BY address LIMIT 100", [chain])).rows;
    return { chain, identity, checkpoint: await store.head(c), counts, gaps, sources,
      coverage: "bounded_canonical_discovery", tokenCoverage: "unproven", tradingEnabled: false,
      limits: { pageSize: 100, sourceReplayEvents: 20000 },
      limitations: ["No production promotion", "No independent owner/balance/supply reconciliation", "No full-chain coverage claim", "Discovery visibility requires a separate operator decision"] };
  });
}
export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseDiscoveryArgs(argv);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (["scan", "classify", "metadata"].includes(options.command) && !env.STARKNET_RPC_URL) throw new Error("STARKNET_RPC_URL is required");
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 }), store = new PgDiscoveryStore(pool, options.chain);
  try {
    let result;
    if (options.command === "report") result = await discoveryReport(store);
    else if (options.command === "replay") result = await replayDiscoveredSource(store, options.source);
    else {
      const rpc = new RpcClient([env.STARKNET_RPC_URL], { retries: 1, rateLimitRetries: 2 });
      result = options.command === "metadata" ? await refreshDiscoveryMetadata(store, rpc, { limit: options.limit, ipfsGateway: env.IPFS_GATEWAY }) : options.command === "classify" ? await classifyDiscovery(store, rpc, { limit: options.limit }) :
        await scanDiscovery(store, rpc, { chain: options.chain, chainId: chains[options.chain], startBlock: options.start }, { window: options.window, stopAt: options.stop });
    }
    console.log(JSON.stringify(result)); return result;
  } finally { await pool.end(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: "Discovery operation failed", code: error.code ?? "DISCOVERY_FAILED" })); process.exitCode = 1;
});
