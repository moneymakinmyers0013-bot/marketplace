import test from "node:test";
import assert from "node:assert/strict";
import { prepareDiscoveryBlock, scanDiscovery } from "../src/discovery.mjs";
import { address } from "../src/domain.mjs";

function block(n, changes = {}, transactions = []) {
  return {
    block_number: n, block_hash: `0x${(n + 16).toString(16)}`,
    parent_hash: `0x${(n + 15).toString(16)}`, status: "ACCEPTED_ON_L2",
    timestamp: n, transactions,
    update: { block_hash: `0x${(n + 16).toString(16)}`, state_diff: {
      deployed_contracts: [], replaced_classes: [], ...changes,
    } },
  };
}
function fixture(blocks) {
  const calls = [];
  return { calls, urls: ["http://fixture"], async call(method, params) {
    calls.push({ method, params });
    if (method === "starknet_chainId") return "0x534e5f4d41494e";
    if (method === "starknet_specVersion") return "0.8.1";
    const id = params.block_id;
    const b = id === "latest" ? blocks.at(-1)
      : blocks.find(b => id.block_hash ? b.block_hash === id.block_hash : b.block_number === id.block_number);
    if (!b) throw Object.assign(new Error("No history"), { details: { rpcCode: 24 } });
    return method === "starknet_getStateUpdate" ? b.update : b;
  } };
}
function memory() {
  return { blocks: [], gaps: [], async head() { return this.blocks.at(-1) ?? null; },
    async commit(b, expected) { assert.equal(this.blocks.at(-1)?.hash ?? null, expected?.hash ?? null); this.blocks.push(b); },
    async rewind(n) { this.blocks = this.blocks.filter(b => b.number <= n); },
    async recordGap(gap) { this.gaps.push(gap); }, async bind() {}, async recordProbe() {},
  };
}
const config = { chain: "SN_MAIN", chainId: "0x534e5f4d41494e", startBlock: 0 };

test("discovers zero-mint deployments, class replacements and ordered constructor emitters", () => {
  const b = block(0, { deployed_contracts: [{ address: "0x123", class_hash: "0x456" }],
    replaced_classes: [{ contract_address: "0x789", class_hash: "0xabc" }] }, [{
      transaction: { transaction_hash: "0x91" }, receipt: { transaction_hash: "0x91", execution_status: "SUCCEEDED",
        events: [{ from_address: "0x123", keys: ["0x1"], data: [] }] },
    }]);
  const prepared = prepareDiscoveryBlock(b, b.update);
  assert.equal(prepared.changes.length, 2);
  assert.equal(prepared.changes[0].kind, "deployment");
  assert.equal(prepared.changes[1].kind, "replacement");
  assert.equal(prepared.changes[0].positionPrecision, "block_end");
  assert.equal(prepared.events[0].transactionIndex, 0);
  assert.equal(prepared.events[0].eventIndex, 0);
  assert.equal(prepared.events[0].address, address("0x123"));
});

test("state diff identities, duplicate addresses and reverted receipt events are strict", () => {
  const b = block(0);
  assert.throws(() => prepareDiscoveryBlock(b, { ...b.update, block_hash: "0x999" }), /identity/);
  b.update.state_diff.deployed_contracts = [{ address: "0x123", class_hash: "0x456" }, { address: "0x123", class_hash: "0x456" }];
  assert.throws(() => prepareDiscoveryBlock(b, b.update), /Duplicate/);
  const r = block(0, {}, [{ transaction: { transaction_hash: "0x91" }, receipt: {
    transaction_hash: "0x91", execution_status: "REVERTED", events: [{ from_address: "0x123", keys: [], data: [] }],
  } }]);
  assert.equal(prepareDiscoveryBlock(r, r.update).events.length, 0);
});

test("receipt-only RPC transaction identities are accepted without weakening conflict checks", () => {
  const entry = { transaction: { type: "INVOKE", version: "0x3" }, receipt: {
    transaction_hash: "0x91", execution_status: "SUCCEEDED",
    events: [{ from_address: "0x123", keys: ["0x1"], data: [] }],
  } };
  const b = block(0, {}, [entry]);
  assert.equal(prepareDiscoveryBlock(b, b.update).events[0].transactionHash, "0x91");
  entry.transaction.transaction_hash = "0x92";
  assert.throws(() => prepareDiscoveryBlock(b, b.update), /identity/);
  delete entry.transaction.transaction_hash;
  b.transactions.push(structuredClone(entry));
  assert.throws(() => prepareDiscoveryBlock(b, b.update), /duplicate/);
  b.transactions.pop();
  delete entry.receipt.transaction_hash;
  assert.throws(() => prepareDiscoveryBlock(b, b.update));
});

test("bounded acquisition resumes after restart and advances through empty blocks", async () => {
  const rpc = fixture([block(0), block(1), block(2)]), store = memory();
  assert.equal((await scanDiscovery(store, rpc, config, { window: 2 })).indexed, 1);
  assert.equal((await scanDiscovery(store, rpc, config, { window: 2 })).indexed, 2);
  const before = rpc.calls.filter(c => c.method === "starknet_getStateUpdate").length;
  await scanDiscovery(store, rpc, config);
  assert.equal(rpc.calls.filter(c => c.method === "starknet_getStateUpdate").length, before);
  assert.equal(store.blocks.length, 3);
});

test("reorg rewinds discovery before replay and never advances on conflicting range anchor", async () => {
  const store = memory(), old = fixture([block(0), block(1)]);
  await scanDiscovery(store, old, config);
  const replacement = block(1);
  replacement.block_hash = replacement.update.block_hash = "0x41";
  await scanDiscovery(store, fixture([block(0), replacement]), config);
  assert.equal(store.blocks.at(-1).hash, "0x41");
  const rpc = fixture([block(0)]), call = rpc.call.bind(rpc);
  let anchors = 0;
  rpc.call = async (method, params) => {
    const result = await call(method, params);
    if (method === "starknet_getBlockWithTxHashes" && params.block_id !== "latest" && ++anchors === 2)
      return { ...result, block_hash: "0x71" };
    return result;
  };
  const fresh = memory();
  await assert.rejects(scanDiscovery(fresh, rpc, config), /changed/);
  assert.equal(fresh.blocks.length, 0);
});

test("missing history records explicit gap without falsely committing source coverage", async () => {
  const store = memory(), rpc = fixture([block(1)]);
  await assert.rejects(scanDiscovery(store, rpc, config), /No history/);
  assert.equal(store.blocks.length, 0);
  assert.equal(store.gaps[0].from, 0);
  assert.equal(store.gaps[0].reason, "historical_unavailable");
  assert.equal(store.gaps[0].retryable, false);
});

test("chain mismatch blocks all discovery writes; unsupported RPC capability is retained", async () => {
  const store = memory(), rpc = fixture([block(0)]), call = rpc.call.bind(rpc);
  rpc.call = (method, params) => method === "starknet_chainId" ? "0x1" : call(method, params);
  await assert.rejects(scanDiscovery(store, rpc, config), /another chain/);
  assert.equal(store.blocks.length, 0);
});

test("acquisition byte budget fails before projecting an oversized shared window", async () => {
  const store = memory(), rpc = fixture([block(0)]);
  await assert.rejects(scanDiscovery(store, rpc, config, { maxAcquisitionBytes: 100 }), /budget/);
  assert.equal(store.blocks.length, 0);
});

test("reorg ancestor search is bounded and reports the unresolved canonical gap", async () => {
  const store = memory();
  await scanDiscovery(store, fixture([block(0), block(1), block(2)]), config);
  const fork = [block(0), block(1), block(2)].map(b => ({ ...b, block_hash: "0x99" }));
  await assert.rejects(scanDiscovery(store, fixture(fork), config, { maxRewind: 1 }), /rewind budget/);
  assert.equal(store.blocks.length, 2);
  assert.equal(store.gaps.at(-1).reason, "DISCOVERY_REWIND_BUDGET");
});
