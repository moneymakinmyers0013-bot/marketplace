import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SharedBlockReader,
  ReceiptCache,
  extractBlockEvents,
  routeWindow,
  eventIdentity,
} from "../src/block-acquisition.mjs";
import { SELECTORS, decodeEvent } from "../src/decode.mjs";
import { address, ApiError } from "../src/domain.mjs";

const CHAIN = "0x534e5f4d41494e";
const hash = (n, fork = "") => "0x" + (BigInt(n) * 1000n + BigInt(fork.length)).toString(16) + "ab";
const transfer = (from, token, to = "0x22") => ({
  from_address: from,
  keys: [SELECTORS.Transfer, "0x0", to, token, "0x0"],
  data: [],
});
function block(n, txs, { fork = "", parentFork = fork } = {}) {
  return {
    status: "ACCEPTED_ON_L2",
    block_number: n,
    block_hash: hash(n, fork),
    parent_hash: hash(n - 1, parentFork),
    timestamp: 1700000000 + n,
    transactions: txs.map((events, i) => ({
      transaction: { transaction_hash: "0x" + (n * 100 + i).toString(16) },
      receipt: {
        transaction_hash: "0x" + (n * 100 + i).toString(16),
        execution_status: "SUCCEEDED",
        events,
      },
    })),
  };
}
/** Fake RPC that serves a mutable chain and counts provider work. */
function fakeRpc(chain) {
  const rpc = {
    chain,
    calls: 0,
    batches: 0,
    getEvents: 0,
    async call(method, params) {
      this.calls++;
      if (method === "starknet_getEvents") this.getEvents++;
      if (method !== "starknet_getBlockWithReceipts") throw new Error(method);
      const b = this.chain.get(params.block_id.block_number);
      if (!b) throw new ApiError("RPC_CONTRACT_ERROR", "Block not found", 502);
      return structuredClone(b);
    },
    async batch(calls) {
      this.batches++;
      return Promise.all(calls.map((c) => this.call(c.method, c.params)));
    },
  };
  return rpc;
}
const chainOf = (blocks) => new Map(blocks.map((b) => [b.block_number, b]));
const collectionSources = (n, start) =>
  Array.from({ length: n }, (_, i) => ({
    address: "0x" + (0x1000 + i).toString(16),
    kind: "collection",
    start,
  }));
const decode = (raw, source) =>
  decodeEvent(raw, { chain: "SN_MAIN", collections: [{ address: source.address }] });

test("one receipt acquisition per block serves every collection, independent of collection count", async () => {
  const sources = collectionSources(50, 10);
  const blocks = [];
  for (let n = 10; n < 20; n++)
    blocks.push(block(n, [sources.slice(0, 5).map((s, i) => transfer(s.address, "0x" + (n * 10 + i).toString(16)))]));
  const rpc = fakeRpc(chainOf(blocks));
  const reader = new SharedBlockReader(rpc, { chainId: CHAIN, batchSize: 4, concurrency: 2 });
  const window = await reader.read(10, 19, { parentHash: hash(9) });
  assert.equal(window.blocks.length, 10);
  assert.equal(rpc.getEvents, 0);
  assert.equal(rpc.calls, 10, "exactly one getBlockWithReceipts per block");
  assert.equal(rpc.batches, 3, "ceil(10 / batchSize) provider round trips");
  const routed = routeWindow(window, { sources, decode });
  assert.equal(routed.sources.get(address(sources[0].address)).events.length, 10);
  assert.equal(routed.sources.get(address(sources[49].address)).events.length, 0);
  assert.equal(routed.metrics.routedEvents, 50);
  // Idle sources still advance freshness to the canonical window end.
  assert.deepEqual(routed.sources.get(address(sources[49].address)).checkpoint, {
    block: 19,
    hash: hash(19),
  });
});

test("event identity is deterministic and canonical order is block, transaction, event", async () => {
  const a = "0xa1";
  const b0 = block(5, [[transfer(a, "0x2"), transfer(a, "0x1")], [], [transfer(a, "0x3")]]);
  const one = extractBlockEvents(b0, { chainId: CHAIN, expectedNumber: 5 });
  const two = extractBlockEvents(structuredClone(b0), { chainId: CHAIN, expectedNumber: 5 });
  assert.deepEqual(one.events.map((e) => e.id), two.events.map((e) => e.id));
  assert.deepEqual(
    one.events.map((e) => [e.position.block, e.position.transaction, e.position.event]),
    [[5, 0, 0], [5, 0, 1], [5, 2, 0]],
  );
  assert.equal(one.events[0].id, eventIdentity(CHAIN, hash(5), "0x1f4", 0));
  assert.notEqual(eventIdentity(CHAIN, hash(5), "0x1f4", 0), eventIdentity("0x1", hash(5), "0x1f4", 0));
  const fork = extractBlockEvents(block(5, [[transfer(a, "0x2")]], { fork: "z" }), { chainId: CHAIN, expectedNumber: 5 });
  assert.notEqual(fork.events[0].id, one.events[0].id, "same height on another fork has another identity");
});

test("reverted receipts, pending heads and mismatched heights are never projected", () => {
  const b = block(7, [[transfer("0xa1", "0x1")]]);
  b.transactions[0].receipt.execution_status = "REVERTED";
  assert.equal(extractBlockEvents(b, { chainId: CHAIN, expectedNumber: 7 }).events.length, 0);
  assert.throws(
    () => extractBlockEvents({ ...b, status: "PRE_CONFIRMED" }, { chainId: CHAIN, expectedNumber: 7 }),
    { code: "UNACCEPTED_BLOCK" },
  );
  assert.throws(() => extractBlockEvents(b, { chainId: CHAIN, expectedNumber: 8 }), {
    code: "INVALID_RPC_BLOCK",
  });
  const conflicting = block(7, [[transfer("0xa1", "0x1")]]);
  conflicting.transactions[0].transaction.transaction_hash = "0xdead";
  assert.throws(() => extractBlockEvents(conflicting, { chainId: CHAIN, expectedNumber: 7 }), {
    code: "INVALID_RECEIPT",
  });
});

test("reorgs against the stored head or inside the window are reported with the fork height", async () => {
  const blocks = [block(1, []), block(2, []), block(3, [], { fork: "x", parentFork: "x" })];
  const rpc = fakeRpc(chainOf(blocks));
  const reader = new SharedBlockReader(rpc, { chainId: CHAIN });
  await assert.rejects(reader.read(1, 3, { parentHash: hash(0) }), (e) => {
    assert.equal(e.code, "CHAIN_REORG");
    assert.equal(e.details.block, 3);
    return true;
  });
  const rpc2 = fakeRpc(chainOf([block(1, []), block(2, [])]));
  await assert.rejects(
    new SharedBlockReader(rpc2, { chainId: CHAIN }).read(1, 2, { parentHash: "0xbeef" }),
    (e) => e.code === "CHAIN_REORG" && e.details.block === 1,
  );
});

test("cached receipts are reused across readers and invalidated when the canonical chain moves", async () => {
  const cache = new ReceiptCache({ maxBlocks: 100, maxBytes: 1 << 20 });
  const rpc = fakeRpc(chainOf([1, 2, 3, 4].map((n) => block(n, [[transfer("0xa1", "0x" + n)]]))));
  const backfill = new SharedBlockReader(rpc, { chainId: CHAIN, cache });
  await backfill.read(1, 4, { parentHash: hash(0) });
  assert.equal(rpc.calls, 4);
  const live = new SharedBlockReader(rpc, { chainId: CHAIN, cache });
  const again = await live.read(1, 4, { parentHash: hash(0) });
  assert.equal(rpc.calls, 4, "second reader used the shared cache");
  assert.equal(again.metrics.cacheHits, 4);
  // Block 3 and 4 are replaced by a fork. Cached copies no longer link to the new head.
  rpc.chain.set(3, block(3, [], { fork: "y", parentFork: "" }));
  rpc.chain.set(4, block(4, [], { fork: "y", parentFork: "y" }));
  rpc.chain.set(5, { ...block(5, []), parent_hash: hash(4, "y") });
  const after = await live.read(4, 5, { parentHash: hash(3, "y") });
  assert.equal(after.blocks[0].hash, hash(4, "y"), "stale cached block was refetched");
  assert.ok(cache.stats().evictions >= 1);
});

test("receipt cache is bounded by block count and bytes", () => {
  const cache = new ReceiptCache({ maxBlocks: 2, maxBytes: 1000 });
  for (let n = 1; n <= 3; n++) cache.set({ number: n, hash: hash(n), events: [] }, 100);
  assert.equal(cache.get(1), undefined);
  assert.ok(cache.get(3));
  cache.set({ number: 9, hash: hash(9), events: [] }, 5000);
  assert.equal(cache.get(9), undefined, "oversized entries are not retained");
  assert.ok(cache.stats().bytes <= 1000);
});

test("window budgets bound blocks, events and bytes before any projection work", async () => {
  const many = Array.from({ length: 30 }, () => transfer("0xa1", "0x1"));
  const rpc = fakeRpc(chainOf([block(1, [many]), block(2, [many])]));
  assert.throws(() => new SharedBlockReader(rpc, { chainId: CHAIN, batchSize: 65 }), {
    code: "INVALID_WINDOW",
  });
  await assert.rejects(
    new SharedBlockReader(rpc, { chainId: CHAIN, maxBlocksPerWindow: 1 }).read(1, 2),
    { code: "INVALID_WINDOW" },
  );
  await assert.rejects(
    new SharedBlockReader(rpc, { chainId: CHAIN, maxEventsPerWindow: 40 }).read(1, 2),
    { code: "ACQUISITION_BUDGET" },
  );
  await assert.rejects(
    new SharedBlockReader(rpc, { chainId: CHAIN, maxBytesPerWindow: 500 }).read(1, 2),
    { code: "ACQUISITION_BUDGET" },
  );
});

test("unknown NFT-shaped emitters become discovery candidates without being projected", async () => {
  const known = "0xa1",
    unknown = "0xb2";
  const rpc = fakeRpc(
    chainOf([
      block(1, [[transfer(unknown, "0x1"), transfer(known, "0x1")]]),
      block(2, [[transfer(unknown, "0x2"), { from_address: "0xc3", keys: ["0x1234"], data: [] }]]),
    ]),
  );
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(1, 2);
  const routed = routeWindow(window, {
    sources: [{ address: known, kind: "collection", start: 1 }],
    decode,
  });
  assert.equal(routed.candidates.length, 1);
  const [candidate] = routed.candidates;
  assert.equal(candidate.address, address(unknown));
  assert.equal(candidate.events, 2);
  assert.deepEqual(candidate.firstSeen, { block: 1, transaction: 0, event: 0 });
  assert.equal(candidate.lastSeen.block, 2);
  assert.ok(candidate.selectors.includes("Transfer"));
  assert.equal(routed.sources.get(address(known)).events.length, 1);
});

test("malformed NFT data quarantines only that collection with replayable evidence; others keep advancing", async () => {
  const good = "0xa1",
    bad = "0xb2";
  const malformed = { from_address: bad, keys: [SELECTORS.Transfer, "0x0"], data: [] };
  const rpc = fakeRpc(
    chainOf([
      block(1, [[transfer(bad, "0x1"), transfer(good, "0x1")]]),
      block(2, [[malformed, transfer(good, "0x2")]]),
      block(3, [[transfer(bad, "0x3"), transfer(good, "0x3")]]),
    ]),
  );
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(1, 3);
  const routed = routeWindow(window, {
    sources: [
      { address: good, kind: "collection", start: 1 },
      { address: bad, kind: "collection", start: 1 },
    ],
    decode,
  });
  const g = routed.sources.get(address(good)),
    b = routed.sources.get(address(bad));
  assert.equal(g.status, "ok");
  assert.equal(g.events.length, 3);
  assert.deepEqual(g.checkpoint, { block: 3, hash: hash(3) });
  assert.equal(b.status, "quarantined");
  assert.equal(b.events.length, 1, "only events before the failing block are released");
  assert.deepEqual(b.checkpoint, { block: 1, hash: hash(1) });
  assert.equal(b.quarantine.code, "INVALID_EVENT");
  assert.deepEqual(b.quarantine.position, { block: 2, transaction: 0, event: 0 });
  assert.deepEqual(b.quarantine.raw, malformed);
  assert.equal(b.quarantine.id, eventIdentity(CHAIN, hash(2), "0xc8", 0));
});

test("marketplace decoding stays strict: a malformed marketplace event fails the whole window", async () => {
  const market = "0x99";
  const rpc = fakeRpc(
    chainOf([block(1, [[{ from_address: market, keys: [SELECTORS.OrderCancelled, "0x1"], data: [] }]])]),
  );
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(1, 1);
  assert.throws(
    () =>
      routeWindow(window, {
        sources: [{ address: market, kind: "marketplace", start: 1 }],
        decode: (raw) => decodeEvent(raw, { chain: "SN_MAIN", marketplace: market, collections: [] }),
      }),
    { code: "INVALID_EVENT" },
  );
});

test("duplicate windows and restarts are idempotent against per-source checkpoints", async () => {
  const a = "0xa1",
    late = "0xb2";
  const rpc = fakeRpc(chainOf([1, 2, 3].map((n) => block(n, [[transfer(a, "0x" + n), transfer(late, "0x" + n)]]))));
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(1, 3);
  const sources = [
    { address: a, kind: "collection", start: 1 },
    { address: late, kind: "collection", start: 3 },
  ];
  const first = routeWindow(window, { sources, decode });
  assert.equal(first.sources.get(address(a)).events.length, 3);
  assert.equal(first.sources.get(address(late)).events.length, 1, "source start block is respected");
  const checkpoints = new Map([[address(a), { block: 2, hash: hash(2) }]]);
  const replay = routeWindow(window, { sources, decode, checkpoints });
  assert.deepEqual(replay.sources.get(address(a)).events.map((e) => e.position.block), [3]);
  const done = new Map([[address(a), { block: 3, hash: hash(3) }]]);
  assert.equal(routeWindow(window, { sources, decode, checkpoints: done }).sources.get(address(a)).events.length, 0);
  assert.throws(
    () => routeWindow(window, { sources, decode, checkpoints: new Map([[address(a), { block: 2, hash: "0xfeed" }]]) }),
    { code: "CHAIN_REORG" },
  );
});

test("a source whose checkpoint is behind the window start requires backfill instead of silently skipping", async () => {
  const rpc = fakeRpc(chainOf([block(5, []), block(6, [])]));
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(5, 6);
  assert.throws(
    () =>
      routeWindow(window, {
        sources: [{ address: "0xa1", kind: "collection", start: 0 }],
        decode,
        checkpoints: new Map([[address("0xa1"), { block: 2, hash: hash(2) }]]),
      }),
    { code: "SOURCE_BACKFILL_REQUIRED" },
  );
});

test("a newly discovered source cannot join the live window without historical coverage", async () => {
  const rpc = fakeRpc(chainOf([block(5, []), block(6, [])]));
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(5, 6);
  assert.throws(
    () => routeWindow(window, { sources: [{ address: "0xa1", kind: "collection", start: 3 }], decode }),
    (e) => e.code === "SOURCE_BACKFILL_REQUIRED" && e.details.start === 3,
  );
  const joined = routeWindow(window, { sources: [{ address: "0xa1", kind: "collection", start: 6 }], decode });
  assert.deepEqual(joined.sources.get(address("0xa1")).checkpoint, { block: 6, hash: hash(6) });
});

test("ERC-1155 transfer selectors are surfaced as candidates for classification", async () => {
  const single = "0x182d859c0807ba9db63baf8b9d9fdbfeb885d820be6e206b9dab626d995c433";
  const rpc = fakeRpc(chainOf([block(1, [[{ from_address: "0xe1", keys: [single], data: [] }]])]));
  const window = await new SharedBlockReader(rpc, { chainId: CHAIN }).read(1, 1);
  const routed = routeWindow(window, { sources: [], decode });
  assert.deepEqual(routed.candidates.map((c) => c.selectors), [["TransferSingle"]]);
});
