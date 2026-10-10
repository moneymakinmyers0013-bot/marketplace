import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgDiscoveryStore } from "../../src/postgres/discovery.mjs";
import { replayDiscoveredSource } from "../../src/postgres/discovery-replay.mjs";
import { address } from "../../src/domain.mjs";
import { SELECTORS } from "../../src/decode.mjs";
const source = address("0x123");
const block = (number, changes = [], events = []) => ({ number, hash: `0x${number + 10}`,
  parentHash: `0x${number + 9}`, timestamp: number, changes, events });
async function setup(t) {
  const db = await testDatabase(t), pool = db.pool(); await migrate(pool);
  const store = new PgDiscoveryStore(pool, "SN_MAIN");
  await store.bind({ startBlock: 0, chainId: "0x534e5f4d41494e" });
  return { pool, store };
}
const event = (to = "0x456", from = "0x0", eventIndex = 0) => ({ address: source,
  transactionHash: "0x91", transactionIndex: 0, eventIndex,
  raw: { from_address: source, keys: [SELECTORS.Transfer, from, to, "1", "0"], data: [] } });
const body = { state: "supported", standard: "erc721", classHash: "0x789", deploymentEvidence: true,
  binding: { address: source, standard: "ERC721", classHash: "0x789", decoderId: "erc721-cairo1-oz-2", selectorPath: [] } };

test("source replay is atomic/idempotent and preserves existing orders/application data", async t => {
  const { pool, store } = await setup(t);
  await pool.query("INSERT INTO app.app_meta VALUES('retained','true')");
  await store.commit(block(0, [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }], [event()]), null);
  await store.classify(source, 0, "0x10", body);
  const first = await replayDiscoveredSource(store, source);
  assert.equal(first.projection.tokens[0].owner, address("0x456"));
  assert.equal(first.coverage.deploymentCovered, true);
  assert.equal(first.coverage.reconciliation, "not_run");
  assert.equal(first.state, "syncing");
  assert.equal(first.projection.tokens[0].settlementEligible, false);
  assert.deepEqual(await replayDiscoveredSource(store, source), first);
  assert.equal((await pool.query("SELECT value FROM app.app_meta WHERE key='retained'")).rowCount, 1);
  assert.equal((await pool.query("SELECT * FROM chain.nft_source_projections")).rowCount, 1);
});

test("malformed source replay withholds source data and reorg removes stale generation", async t => {
  const { pool, store } = await setup(t);
  await store.commit(block(0, [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }], [event()]), null);
  await store.classify(source, 0, "0x10", body);
  await store.commit(block(1, [], [event("0x555", "0x999")]), await store.head());
  const failed = await replayDiscoveredSource(store, source);
  assert.equal(failed.state, "failed");
  assert.equal(failed.projection.tokens.length, 0);
  assert.equal(failed.projection.quarantines.length, 1);
  await store.rewind(0);
  assert.equal((await pool.query("SELECT * FROM chain.nft_source_projections")).rowCount, 0);
  const restored = await replayDiscoveredSource(store, source);
  assert.equal(restored.projection.tokens.length, 1);
  assert.equal(restored.generation, "2");
});

test("class replacement block is quarantined because state diffs lack intra-block class positions", async t => {
  const { store } = await setup(t);
  await store.commit(block(0, [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }], [event()]), null);
  await store.classify(source, 0, "0x10", body);
  await store.commit(block(1, [{ address: source, kind: "replacement", classHash: "0x888", positionPrecision: "block_end" }], [event("0x555", "0x456")]), await store.head());
  await store.classify(source, 1, "0x11", { ...body, classHash: "0x888", deploymentEvidence: false, binding: { ...body.binding, classHash: "0x888" } });
  const result = await replayDiscoveredSource(store, source);
  assert.equal(result.state, "failed");
  assert.equal(result.projection.tokens.length, 0);
  assert.equal(result.coverage.ambiguousUpgradeBlocks[0], 1);
});

test("a supported class after an unsupported interval cannot reopen the earlier decoder", async t => {
  const { store } = await setup(t);
  await store.commit(block(0, [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }], [event()]), null);
  await store.classify(source, 0, "0x10", body);
  await store.commit(block(1, [{ address: source, kind: "replacement", classHash: "0x888", positionPrecision: "block_end" }]), await store.head());
  await store.classify(source, 1, "0x11", { state: "unsupported", binding: null });
  await store.commit(block(2, [], [event("0x555", "0x456")]), await store.head());
  await store.commit(block(3, [{ address: source, kind: "replacement", classHash: "0x789", positionPrecision: "block_end" }]), await store.head());
  await store.classify(source, 3, "0x13", { ...body, deploymentEvidence: false });
  await store.commit(block(4), await store.head());
  const result = await replayDiscoveredSource(store, source);
  assert.equal(result.state, "failed");
  assert.equal(result.projection.tokens.length, 0);
  assert.equal(result.projection.quarantines[0].code, "UNKNOWN_NFT_DECODER");
});

test("an unsupported current class withholds old normalized holdings even when its replacement emits no NFT event", async t => {
  const { pool, store } = await setup(t);
  await store.commit(block(0, [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }], [event()]), null);
  await store.classify(source, 0, "0x10", body);
  await replayDiscoveredSource(store, source);
  assert.equal((await pool.query("SELECT * FROM chain.nft_holdings")).rowCount, 1);
  await store.commit(block(1, [{ address: source, kind: "replacement", classHash: "0x888", positionPrecision: "block_end" }]), await store.head());
  await store.classify(source, 1, "0x11", { state: "unsupported", binding: null });
  const result = await replayDiscoveredSource(store, source);
  assert.equal(result.state, "unsupported");
  assert.equal(result.projection.tokens.length, 1);
  assert.equal((await pool.query("SELECT * FROM chain.nft_tokens")).rowCount, 0);
  assert.equal((await pool.query("SELECT * FROM chain.nft_holdings")).rowCount, 0);
});
