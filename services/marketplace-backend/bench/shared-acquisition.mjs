#!/usr/bin/env node
/**
 * Synthetic benchmark for shared live block acquisition (#114).
 *
 * Compares provider work of one shared receipt reader against the current
 * per-source `starknet_getEvents` pattern as collection and event counts grow.
 * It uses an in-process fake RPC with configurable latency, so results measure
 * request counts, bytes, routing cost and memory, not a real provider. Real
 * provider lag and throughput still have to be measured against mainnet (#118).
 *
 * node services/marketplace-backend/bench/shared-acquisition.mjs \
 *   --blocks 200 --window 50 --events-per-block 40 --collections 1,10,100,1000 \
 *   --batch 8 --concurrency 4 --latency-ms 5 --max-events 100000 --max-bytes 67108864
 */
import { parseArgs } from "node:util";
import { SharedBlockReader, routeWindow } from "../src/block-acquisition.mjs";
import { SELECTORS, decodeEvent } from "../src/decode.mjs";

const { values } = parseArgs({
  options: {
    blocks: { type: "string", default: "200" },
    window: { type: "string", default: "50" },
    "events-per-block": { type: "string", default: "40" },
    collections: { type: "string", default: "1,10,100,1000" },
    batch: { type: "string", default: "8" },
    concurrency: { type: "string", default: "4" },
    "latency-ms": { type: "string", default: "5" },
    "max-events": { type: "string", default: "100000" },
    "max-bytes": { type: "string", default: String(64 * 1024 * 1024) },
    json: { type: "boolean", default: false },
  },
});
const int = (k) => {
  const n = Number(values[k]);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${k} must be a non-negative integer`);
  return n;
};
const blocks = int("blocks"),
  windowSize = int("window"),
  perBlock = int("events-per-block"),
  latency = int("latency-ms");
const counts = values.collections.split(",").map(Number);
const hash = (n) => "0x" + (BigInt(n) + 0x1000n).toString(16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chain(collections) {
  const out = new Map();
  for (let n = 1; n <= blocks; n++) {
    const events = Array.from({ length: perBlock }, (_, i) => ({
      from_address: "0x" + (0x10000 + ((n * perBlock + i) % (collections * 2))).toString(16),
      keys: [SELECTORS.Transfer, "0x0", "0x" + (i + 1).toString(16), "0x" + (n * perBlock + i).toString(16), "0x0"],
      data: [],
    }));
    out.set(n, {
      status: "ACCEPTED_ON_L2",
      block_number: n,
      block_hash: hash(n),
      parent_hash: hash(n - 1),
      timestamp: n,
      transactions: [{ transaction: { transaction_hash: "0x" + n.toString(16) }, receipt: { transaction_hash: "0x" + n.toString(16), execution_status: "SUCCEEDED", events } }],
    });
  }
  return out;
}

async function run(collections) {
  const data = chain(collections);
  const rpc = {
    async call(_m, p) {
      return structuredClone(data.get(p.block_id.block_number));
    },
    async batch(calls) {
      await sleep(latency);
      return calls.map((c) => structuredClone(data.get(c.params.block_id.block_number)));
    },
  };
  const sources = Array.from({ length: collections }, (_, i) => ({
    address: "0x" + (0x10000 + i).toString(16),
    kind: "collection",
    start: 1,
  }));
  const decode = (raw, s) => decodeEvent(raw, { chain: "SN_MAIN", collections: [{ address: s.address }] });
  const reader = new SharedBlockReader(rpc, {
    chainId: "0x534e5f4d41494e",
    batchSize: int("batch"),
    concurrency: int("concurrency"),
    maxBlocksPerWindow: Math.max(1, windowSize),
    maxEventsPerWindow: int("max-events"),
    maxBytesPerWindow: int("max-bytes"),
  });
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed,
    started = performance.now();
  let checkpoints = new Map(),
    parentHash = hash(0),
    requests = 0,
    roundTrips = 0,
    bytes = 0,
    routed = 0,
    candidates = 0,
    writes = 0,
    peakHeap = heapBefore,
    worstWindowMs = 0;
  for (let from = 1; from <= blocks; from += windowSize) {
    const to = Math.min(blocks, from + windowSize - 1),
      t = performance.now();
    const window = await reader.read(from, to, { parentHash });
    const result = routeWindow(window, { sources, decode, checkpoints });
    requests += window.metrics.requests;
    roundTrips += window.metrics.providerRoundTrips;
    bytes += window.metrics.bytes;
    routed += result.metrics.routedEvents;
    candidates += result.metrics.candidates;
    // One row per projected event plus one checkpoint row per source, per window.
    writes += result.metrics.routedEvents + result.sources.size;
    checkpoints = new Map([...result.sources].map(([k, v]) => [k, v.checkpoint]));
    parentHash = window.blocks.at(-1).hash;
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    worstWindowMs = Math.max(worstWindowMs, performance.now() - t);
  }
  const windows = Math.ceil(blocks / windowSize);
  return {
    collections,
    blocks,
    eventsPerBlock: perBlock,
    shared: {
      requests,
      providerRoundTrips: roundTrips,
      bytes,
      routedEvents: routed,
      discoveryCandidates: candidates,
      dbWrites: writes,
      elapsedMs: Math.round(performance.now() - started),
      worstWindowMs: Math.round(worstWindowMs),
      peakHeapDeltaMb: Number(((peakHeap - heapBefore) / 1048576).toFixed(1)),
    },
    perSourceGetEventsLowerBound: { requests: windows * collections, note: "one getEvents page per source per window, before pagination" },
  };
}

const rows = [];
for (const n of counts) rows.push(await run(n));
if (values.json) console.log(JSON.stringify(rows, null, 2));
else
  console.table(
    rows.map((r) => ({
      collections: r.collections,
      "shared requests": r.shared.requests,
      "round trips": r.shared.providerRoundTrips,
      "per-source getEvents (min)": r.perSourceGetEventsLowerBound.requests,
      "MB read": (r.shared.bytes / 1048576).toFixed(2),
      routed: r.shared.routedEvents,
      "db writes": r.shared.dbWrites,
      ms: r.shared.elapsedMs,
      "worst window ms": r.shared.worstWindowMs,
      "heap MB": r.shared.peakHeapDeltaMb,
    })),
  );
