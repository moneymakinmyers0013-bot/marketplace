/**
 * Shared live block acquisition (#114).
 *
 * Accepted blocks are read once per chain with `starknet_getBlockWithReceipts`
 * and their events are routed to every registered source, so provider work is
 * proportional to blocks, not to blocks x collections. Routing preserves the
 * canonical (block, transaction, event) order, gives each event a deterministic
 * chain-scoped identity, isolates malformed collection data to that collection
 * and keeps marketplace decoding strict. Nothing here writes to a store: callers
 * commit `routeWindow` output together with the returned per-source checkpoints
 * in one transaction.
 */
import { mapConcurrent } from "./concurrency.mjs";
import { address, ApiError } from "./domain.mjs";
import { SELECTORS } from "./decode.mjs";

const ACCEPTED = new Set(["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"]);
const same = (a, b) => a != null && b != null && BigInt(a) === BigInt(b);
const hex = (v) => "0x" + BigInt(v).toString(16);

/**
 * Selectors that make an unknown emitter worth classifying. ERC-20 shares the
 * Transfer selector, so a candidate is only evidence for #111 classification,
 * never a collection.
 */
const TRANSFER_SINGLE =
  "0x182d859c0807ba9db63baf8b9d9fdbfeb885d820be6e206b9dab626d995c433";
const TRANSFER_BATCH =
  "0x2563683c757f3abe19c4b7237e2285d8993417ddffe0b54a19eb212ea574b08";
const CANDIDATE_SELECTORS = new Map([
  [BigInt(SELECTORS.Transfer).toString(), "Transfer"],
  [BigInt(SELECTORS.ApprovalForAll).toString(), "ApprovalForAll"],
  [BigInt(TRANSFER_SINGLE).toString(), "TransferSingle"],
  [BigInt(TRANSFER_BATCH).toString(), "TransferBatch"],
]);

export const DEFAULT_BUDGETS = Object.freeze({
  batchSize: 8,
  concurrency: 4,
  maxBlocksPerWindow: 200,
  maxEventsPerWindow: 100000,
  maxBytesPerWindow: 64 * 1024 * 1024,
});

/**
 * Deterministic raw-event identity matching the journal contract in
 * docs/BACKEND-SCOPE.md 5.3: chain, block hash, transaction hash and receipt
 * event index. A refetch of the same canonical block yields the same id; the
 * same height on another fork does not.
 */
export function eventIdentity(chainId, blockHash, transactionHash, eventIndex) {
  return `${hex(chainId)}:${hex(blockHash)}:${hex(transactionHash)}:${eventIndex}`;
}

/** Validate one accepted receipt block and flatten its events in canonical order. */
export function extractBlockEvents(b, { chainId, expectedNumber }) {
  if (!b || typeof b !== "object")
    throw new ApiError("INVALID_RPC_BLOCK", "Missing receipt block.", 502);
  if (!ACCEPTED.has(b.status) || b.block_hash == null)
    throw new ApiError(
      "UNACCEPTED_BLOCK",
      `Block ${expectedNumber} is not accepted.`,
      503,
    );
  if (b.block_number !== expectedNumber || !Array.isArray(b.transactions))
    throw new ApiError(
      "INVALID_RPC_BLOCK",
      `Expected accepted receipts for block ${expectedNumber}.`,
      502,
    );
  const events = [];
  for (const [transaction, entry] of b.transactions.entries()) {
    const receipt = entry?.receipt;
    if (!receipt || !Array.isArray(receipt.events))
      throw new ApiError("INVALID_RECEIPT", "Missing ordered receipt events.", 502);
    const declared = entry.transaction?.transaction_hash;
    const txHash = receipt.transaction_hash ?? declared;
    if (txHash == null)
      throw new ApiError("INVALID_RECEIPT", "Receipt transaction identity missing.", 502);
    if (declared != null && receipt.transaction_hash != null && !same(declared, receipt.transaction_hash))
      throw new ApiError("INVALID_RECEIPT", "Conflicting transaction identity.", 502);
    if (receipt.execution_status === "REVERTED") continue;
    for (const [event, raw] of receipt.events.entries())
      events.push({
        id: eventIdentity(chainId, b.block_hash, txHash, event),
        position: { block: expectedNumber, transaction, event },
        blockHash: hex(b.block_hash),
        transactionHash: hex(txHash),
        raw,
      });
  }
  return {
    number: expectedNumber,
    hash: hex(b.block_hash),
    parentHash: hex(b.parent_hash),
    timestamp: b.timestamp,
    events,
  };
}

/**
 * Bounded receipt cache shared by readers on one chain (for example a backfill
 * worker and the live reader). Entries are only trusted after the reader checks
 * hash linkage, and a broken link evicts them.
 */
export class ReceiptCache {
  constructor({ maxBlocks = 512, maxBytes = 32 * 1024 * 1024 } = {}) {
    this.maxBlocks = maxBlocks;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.bytes = 0;
    this.evictions = 0;
    this.hits = 0;
  }
  get(number) {
    const entry = this.entries.get(number);
    if (!entry) return undefined;
    this.entries.delete(number);
    this.entries.set(number, entry);
    this.hits++;
    return entry.block;
  }
  set(block, bytes) {
    this.delete(block.number);
    if (bytes > this.maxBytes) return;
    this.entries.set(block.number, { block, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxBlocks || this.bytes > this.maxBytes) {
      const [oldest] = this.entries.keys();
      this.delete(oldest);
      this.evictions++;
    }
  }
  delete(number) {
    const entry = this.entries.get(number);
    if (!entry) return false;
    this.entries.delete(number);
    this.bytes -= entry.bytes;
    return true;
  }
  /** Drop every cached height at or above `number` (fork invalidation). */
  invalidateFrom(number) {
    for (const n of [...this.entries.keys()])
      if (n >= number && this.delete(n)) this.evictions++;
  }
  stats() {
    return {
      blocks: this.entries.size,
      bytes: this.bytes,
      evictions: this.evictions,
      hits: this.hits,
    };
  }
}

function bounded(name, value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new ApiError("INVALID_WINDOW", `${name} must be 1-${max}.`);
  return value;
}

export class SharedBlockReader {
  constructor(rpc, { chainId, cache = null, ...budgets } = {}) {
    if (chainId == null) throw new ApiError("INVALID_CONFIG", "chainId is required.");
    const b = { ...DEFAULT_BUDGETS, ...budgets };
    this.rpc = rpc;
    this.chainId = chainId;
    this.cache = cache;
    this.budgets = {
      batchSize: bounded("batchSize", b.batchSize, 64),
      concurrency: bounded("concurrency", b.concurrency, 32),
      maxBlocksPerWindow: bounded("maxBlocksPerWindow", b.maxBlocksPerWindow, 1000),
      maxEventsPerWindow: bounded("maxEventsPerWindow", b.maxEventsPerWindow, 10_000_000),
      maxBytesPerWindow: bounded("maxBytesPerWindow", b.maxBytesPerWindow, 2 ** 40),
    };
  }

  /**
   * Read accepted blocks [from, to] once. `parentHash` is the stored hash of
   * block from-1; a mismatch, or a broken link inside the window, raises
   * CHAIN_REORG with the first height that must be rewound.
   */
  async read(from, to, { parentHash } = {}) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from)
      throw new ApiError("INVALID_WINDOW", "Invalid block range.");
    if (to - from + 1 > this.budgets.maxBlocksPerWindow)
      throw new ApiError("INVALID_WINDOW", "Window exceeds maxBlocksPerWindow.");
    const metrics = { requests: 0, providerRoundTrips: 0, bytes: 0, cacheHits: 0, refetched: 0 };
    const heights = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    let blocks = await this.#load(heights, metrics);
    let broken = this.#firstBrokenLink(blocks, parentHash);
    if (broken >= 0 && blocks[broken].cached) {
      // A cached copy may belong to an abandoned fork: refetch from there once.
      this.cache?.invalidateFrom(blocks[broken].block.number);
      const refetched = await this.#load(heights.slice(broken), metrics, { skipCache: true });
      metrics.refetched += refetched.length;
      blocks = [...blocks.slice(0, broken), ...refetched];
      broken = this.#firstBrokenLink(blocks, parentHash);
    }
    if (broken >= 0) {
      this.cache?.invalidateFrom(blocks[broken].block.number);
      throw new ApiError(
        "CHAIN_REORG",
        `Block ${blocks[broken].block.number} does not extend the expected parent.`,
        409,
        { block: blocks[broken].block.number },
      );
    }
    const events = blocks.reduce((n, b) => n + b.block.events.length, 0);
    if (events > this.budgets.maxEventsPerWindow)
      throw new ApiError("ACQUISITION_BUDGET", "Window exceeds maxEventsPerWindow; use a smaller window.", 413, { events });
    for (const b of blocks) if (this.cache && !b.cached) this.cache.set(b.block, b.bytes);
    return {
      chainId: hex(this.chainId),
      from,
      to,
      blocks: blocks.map((b) => b.block),
      metrics: { ...metrics, blocks: blocks.length, events },
    };
  }

  #firstBrokenLink(blocks, parentHash) {
    for (let i = 0; i < blocks.length; i++) {
      const expected = i === 0 ? parentHash : blocks[i - 1].block.hash;
      if (expected != null && !same(blocks[i].block.parentHash, expected)) return i;
    }
    return -1;
  }

  async #load(heights, metrics, { skipCache = false } = {}) {
    const out = new Array(heights.length),
      missing = [];
    heights.forEach((n, i) => {
      const hit = skipCache ? undefined : this.cache?.get(n);
      if (hit) {
        metrics.cacheHits++;
        out[i] = { block: hit, cached: true, bytes: 0 };
      } else missing.push(i);
    });
    const groups = [];
    for (let i = 0; i < missing.length; i += this.budgets.batchSize)
      groups.push(missing.slice(i, i + this.budgets.batchSize));
    await mapConcurrent(groups, this.budgets.concurrency, async (group) => {
      const calls = group.map((i) => ({
        method: "starknet_getBlockWithReceipts",
        params: { block_id: { block_number: heights[i] } },
      }));
      metrics.providerRoundTrips++;
      metrics.requests += calls.length;
      const results =
        this.rpc.batch && calls.length > 1
          ? await this.rpc.batch(calls)
          : [await this.rpc.call(calls[0].method, calls[0].params)];
      if (!Array.isArray(results) || results.length !== calls.length)
        throw new ApiError("INVALID_RPC_BLOCK", "Missing receipt block in batch.", 502);
      group.forEach((i, j) => {
        const bytes = Buffer.byteLength(JSON.stringify(results[j]));
        metrics.bytes += bytes;
        if (metrics.bytes > this.budgets.maxBytesPerWindow)
          throw new ApiError("ACQUISITION_BUDGET", "Window exceeds maxBytesPerWindow; use a smaller window.", 413, { bytes: metrics.bytes });
        out[i] = {
          block: extractBlockEvents(results[j], { chainId: this.chainId, expectedNumber: heights[i] }),
          cached: false,
          bytes,
        };
      });
    });
    return out;
  }
}

/**
 * Route one acquired window to registered sources.
 *
 * sources: [{ address, kind: "collection" | "marketplace", start }]
 * decode(raw, source, event) returns a decoded event, null for irrelevant
 * selectors, or throws for malformed data.
 * checkpoints: Map(normalizedAddress -> { block, hash }) of committed progress.
 *
 * Returns per-source events and the checkpoint the caller may commit with them,
 * plus discovery candidates for unknown NFT-shaped emitters.
 */
export function routeWindow(window, { sources, decode, checkpoints = new Map() }) {
  const byAddress = new Map(),
    out = new Map(),
    candidates = new Map(),
    hashes = new Map(window.blocks.map((b) => [b.number, b.hash]));
  for (const s of sources) {
    const key = address(s.address);
    if (!Number.isSafeInteger(s.start) || s.start < 0)
      throw new ApiError("INVALID_REGISTRY", `Source ${key} needs a verified start block.`);
    const checkpoint = checkpoints.get(key) ?? null;
    if (checkpoint) {
      if (checkpoint.block < window.from - 1)
        throw new ApiError("SOURCE_BACKFILL_REQUIRED", `Source ${key} is behind the shared window; backfill it independently.`, 409, { source: key, checkpoint: checkpoint.block, from: window.from });
      const pinned = hashes.get(checkpoint.block);
      if (pinned && !same(pinned, checkpoint.hash))
        throw new ApiError("CHAIN_REORG", `Checkpoint for ${key} is not canonical.`, 409, { block: checkpoint.block });
    } else if (s.start < window.from)
      throw new ApiError("SOURCE_BACKFILL_REQUIRED", `Source ${key} has no coverage before block ${window.from}.`, 409, { source: key, start: s.start, from: window.from });
    byAddress.set(key, { ...s, address: key, kind: s.kind ?? "collection" });
    out.set(key, { status: "ok", events: [], checkpoint, quarantine: null, start: s.start, after: checkpoint?.block ?? -1 });
  }
  let decodedEvents = 0,
    ignoredEvents = 0;
  for (const block of window.blocks) {
    for (const event of block.events) {
      let emitter;
      try {
        emitter = address(event.raw.from_address);
      } catch {
        ignoredEvents++;
        continue;
      }
      const source = byAddress.get(emitter);
      if (!source) {
        const selector = Array.isArray(event.raw.keys) && event.raw.keys.length
          ? safeSelector(event.raw.keys[0])
          : null;
        if (selector) {
          const c = candidates.get(emitter) ?? { address: emitter, firstSeen: event.position, firstSeenHash: block.hash, events: 0, selectors: new Set() };
          c.events++;
          c.lastSeen = event.position;
          c.selectors.add(selector);
          candidates.set(emitter, c);
        } else ignoredEvents++;
        continue;
      }
      const state = out.get(emitter);
      if (state.status !== "ok" || block.number <= state.after || block.number < source.start) continue;
      let decoded;
      try {
        decoded = decode(event.raw, source, event);
      } catch (error) {
        if (source.kind === "marketplace") throw error;
        state.status = "quarantined";
        state.quarantine = {
          code: error.code ?? "DECODE_FAILED",
          message: error.message,
          id: event.id,
          position: event.position,
          blockHash: block.hash,
          transactionHash: event.transactionHash,
          raw: event.raw,
        };
        state.events = state.events.filter((e) => e.position.block < block.number);
        const prev = block.number - 1;
        state.checkpoint = hashes.has(prev) ? { block: prev, hash: hashes.get(prev) } : state.checkpoint;
        continue;
      }
      if (!decoded) continue;
      decodedEvents++;
      state.events.push({ ...decoded, id: event.id, position: event.position, blockHash: block.hash, transactionHash: event.transactionHash, raw: event.raw });
    }
  }
  const last = window.blocks.at(-1);
  for (const state of out.values()) {
    if (state.status === "ok" && last) state.checkpoint = { block: last.number, hash: last.hash };
    delete state.after;
  }
  return {
    sources: out,
    candidates: [...candidates.values()].map((c) => ({ ...c, selectors: [...c.selectors] })),
    metrics: {
      blocks: window.blocks.length,
      events: window.blocks.reduce((n, b) => n + b.events.length, 0),
      routedEvents: [...out.values()].reduce((n, s) => n + s.events.length, 0),
      decodedEvents,
      ignoredEvents,
      quarantinedSources: [...out.values()].filter((s) => s.status === "quarantined").length,
      candidates: candidates.size,
    },
  };
}

function safeSelector(key) {
  try {
    return CANDIDATE_SELECTORS.get(BigInt(key).toString()) ?? null;
  } catch {
    return null;
  }
}
