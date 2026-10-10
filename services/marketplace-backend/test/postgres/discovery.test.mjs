import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgDiscoveryStore } from "../../src/postgres/discovery.mjs";
import { address } from "../../src/domain.mjs";
const b = (n, changes = []) => ({ number: n, hash: `0x${n + 10}`, parentHash: `0x${n + 9}`,
  timestamp: n, changes, events: [] });
const change = { address: address("0x123"), classHash: "0x456", kind: "deployment", positionPrecision: "block_end" };

test("catalog preserves policy/application/media and commits discoveries with checkpoints", async t => {
  const db = await testDatabase(t), pool = db.pool();
  await migrate(pool);
  await pool.query("INSERT INTO market.collections VALUES('retained',$1)", [{ visible: true }]);
  await pool.query("INSERT INTO app.app_meta VALUES('retained','true')");
  const store = new PgDiscoveryStore(pool, "SN_MAIN");
  await store.bind({ startBlock: 0, chainId: "0x534e5f4d41494e" });
  await store.commit(b(0, [change]), null);
  await assert.rejects(store.commit(b(0, [{ ...change, classHash: "0x999" }]), null), /contents/);
  await store.commit(b(0, [change]), null);
  assert.equal((await store.head()).number, 0);
  const rows = (await pool.query("SELECT * FROM chain.nft_catalog")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "candidate");
  assert.equal(rows[0].visible, false);
  assert.equal(rows[0].verified, false);
  assert.equal(rows[0].tradable, false);
  assert.equal((await pool.query("SELECT body FROM market.collections WHERE id='retained'")).rowCount, 1);
  assert.equal((await pool.query("SELECT value FROM app.app_meta WHERE key='retained'")).rowCount, 1);
  await assert.rejects(store.commit({ ...b(1), changes: [{ ...change, address: null }] }, await store.head()));
  assert.equal((await store.head()).number, 0);
});

test("competing scanners cannot advance stale heads; rewind invalidates classification", async t => {
  const db = await testDatabase(t), pool = db.pool(); await migrate(pool);
  const store = new PgDiscoveryStore(pool, "SN_MAIN");
  await store.bind({ startBlock: 0, chainId: "0x534e5f4d41494e" });
  await store.commit(b(0, [change]), null);
  await store.commit(b(1, [{ ...change, classHash: "0x789", kind: "replacement" }]), await store.head());
  await store.classify(address("0x123"), 1, "0x11", { standard: "erc721", state: "supported", decoderId: "test", evidence: [] });
  await assert.rejects(store.commit(b(2), { number: 0, hash: "0x10" }), /checkpoint/);
  await store.rewind(0);
  assert.equal((await store.head()).number, 0);
  assert.equal((await pool.query("SELECT * FROM chain.nft_classifications")).rowCount, 0);
  assert.equal((await pool.query("SELECT * FROM chain.nft_catalog")).rows[0].class_hash, "0x456");
  assert.equal((await pool.query("SELECT * FROM chain.nft_catalog")).rows[0].generation, "2");
});

test("stale rewind and historic gap cleanup preserve concurrent coverage", async t => {
  const db = await testDatabase(t), pool = db.pool(); await migrate(pool);
  const store = new PgDiscoveryStore(pool, "SN_MAIN");
  await store.bind({ startBlock: 0, chainId: "0x534e5f4d41494e" });
  await store.recordGap({ from: 0, to: 2, reason: "unavailable", retryable: true, observedAt: 1 });
  await store.commit(b(0), null);
  assert.deepEqual((await pool.query("SELECT from_block,to_block FROM chain.nft_discovery_gaps")).rows, [{ from_block: "1", to_block: "2" }]);
  const old = await store.head();
  await store.commit(b(1), old);
  await assert.rejects(store.rewind(-1, old), /checkpoint/);
  assert.equal((await store.head()).number, 1);
  await store.commit(b(2), await store.head());
  assert.equal((await pool.query("SELECT * FROM chain.nft_discovery_gaps")).rowCount, 0);
});
