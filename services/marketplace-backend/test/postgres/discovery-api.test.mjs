import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgDiscoveryStore } from "../../src/postgres/discovery.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { replayDiscoveredSource } from "../../src/postgres/discovery-replay.mjs";
import { refreshDiscoveryMetadata } from "../../src/discovery-metadata.mjs";
import { createApi } from "../../src/api.mjs";
import { address } from "../../src/domain.mjs";
import { NFT_SELECTORS } from "../../src/nft-decoders.mjs";
const source = address("9"), owner = address("2");
const config = { chain: "LOCAL", chainId: "0x4c4f43414c", marketplace: null, collections: [], currencies: [], operatorToken: "a".repeat(32) };

test("discovered catalog HTTP visibility, lossless token/holdings pagination and bounded metadata stay independent of settlement", async t => {
  const db = await testDatabase(t), pool = db.pool(); await migrate(pool);
  const discovery = new PgDiscoveryStore(pool, "LOCAL");
  await discovery.bind({ startBlock: 0, chainId: config.chainId });
  await discovery.commit({ number: 0, hash: "0x10", parentHash: "0xf", timestamp: 0,
    changes: [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }],
    events: ["2", "9007199254740993"].map((id, eventIndex) => ({ address: source, transactionHash: "0x91", transactionIndex: 0, eventIndex,
      raw: { from_address: source, keys: [NFT_SELECTORS.Transfer, "0", owner, id, "0"], data: [] } })),
  }, null);
  await discovery.classify(source, 0, "0x10", { state: "supported", standard: "erc721", deploymentEvidence: true,
    methodAliases: { token_uri: "token_uri" }, binding: { address: source, standard: "ERC721", classHash: "0x789", decoderId: "erc721-reviewed-v1" } });
  await replayDiscoveredSource(discovery, source);
  const api = createApi({ store: new PgStore(pool), config });
  await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
  t.after(() => { api.closeAllConnections(); api.close(); });
  const root = `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL`;
  const get = async path => (await fetch(root + path)).json();
  assert.equal((await get("/discovery/collections")).data.items.length, 0);
  assert.equal((await fetch(root + `/discovery/collections/${source}/tokens`)).status, 404);
  const publish = { address: source, visible: true, verified: false };
  assert.equal((await fetch(root + "/operator/discovery", { method: "POST", body: JSON.stringify(publish) })).status, 403);
  assert.equal((await fetch(root + "/operator/discovery", { method: "POST", headers: { authorization: "Bearer " + config.operatorToken }, body: JSON.stringify(publish) })).status, 200);
  const collections = (await get("/discovery/collections")).data;
  assert.equal(collections.items[0].settlementEligible, false);
  assert.equal(collections.items[0].verified, false);
  assert.equal(collections.items[0].coverage.historicalComplete, false);
  const first = (await get(`/discovery/collections/${source}/tokens?limit=1`)).data;
  assert.equal(first.items[0].tokenId, "2");
  const second = (await get(`/discovery/collections/${source}/tokens?limit=1&cursor=${first.nextCursor}`)).data;
  assert.equal(second.items[0].tokenId, "9007199254740993");
  assert.equal((await get(`/discovery/accounts/${owner}/holdings`)).data.items.length, 2);
  assert.equal((await get("/collections")).data.length, 0);
  const metadata = await refreshDiscoveryMetadata(discovery, { async call(method, [request, block]) {
    assert.equal(method, "starknet_call");
    assert.deepEqual(request.calldata, ["0x2", "0x0"]);
    assert.deepEqual(block, { block_hash: "0x10" });
    return ["0x68747470733a2f2f6578616d706c652e636f6d2f6e6674"];
  } }, { limit: 1,
    fetchResource: async () => ({ bytes: Buffer.from('{"name":"Discovered item","attributes":[]}') }) });
  assert.equal(metadata.ready, 1);
  assert.equal((await get(`/discovery/collections/${source}/tokens?limit=1`)).data.items[0].metadata.name, "Discovered item");
  await discovery.commit({ number: 1, hash: "0x11", parentHash: "0x10", timestamp: 1, changes: [],
    events: [{ address: source, transactionHash: "0x92", transactionIndex: 0, eventIndex: 0,
      raw: { from_address: source, keys: [NFT_SELECTORS.MetadataUpdate, "2", "0"], data: [] } }],
  }, await discovery.head());
  await replayDiscoveredSource(discovery, source);
  assert.equal((await get(`/discovery/collections/${source}/tokens?limit=1`)).data.items[0].metadataStatus, "pending");
  const refreshed = await refreshDiscoveryMetadata(discovery, { async call() { return ["0x68747470733a2f2f6578616d706c652e636f6d2f6e6674"]; } }, { limit: 2,
    fetchResource: async () => ({ bytes: Buffer.from('{"name":"Updated item"}') }) });
  assert.equal(refreshed.ready, 2);
  assert.equal((await get(`/discovery/collections/${source}/tokens?limit=1`)).data.items[0].metadata.name, "Updated item");
  assert.equal((await fetch(root + `/discovery/accounts/${owner}/holdings?cursor=${first.nextCursor}`)).status, 400);
  await discovery.rewind(-1);
  assert.equal((await pool.query("SELECT * FROM chain.nft_metadata_cache")).rowCount, 2);
  assert.equal((await pool.query("SELECT * FROM app.nft_discovery_policy")).rowCount, 1);
  assert.equal((await get("/discovery/collections")).data.items.length, 0);
});

test("ERC1155 quantities are exposed as lossless holdings with no marketplace policy or settlement mutation", async t => {
  const db = await testDatabase(t), pool = db.pool(); await migrate(pool);
  const discovery = new PgDiscoveryStore(pool, "LOCAL");
  await discovery.bind({ startBlock: 0, chainId: config.chainId });
  await discovery.commit({ number: 0, hash: "0x10", parentHash: "0xf", timestamp: 0,
    changes: [{ address: source, kind: "deployment", classHash: "0x789", positionPrecision: "block_end" }],
    events: [{ address: source, transactionHash: "0x91", transactionIndex: 0, eventIndex: 0,
      raw: { from_address: source, keys: [NFT_SELECTORS.TransferSingle, "3", "0", owner], data: ["9007199254740993", "0", "0", "1"] } }],
  }, null);
  await discovery.classify(source, 0, "0x10", { state: "supported", standard: "erc1155", deploymentEvidence: true,
    binding: { address: source, standard: "ERC1155", classHash: "0x789", decoderId: "erc1155-cairo1-oz-2" } });
  await replayDiscoveredSource(discovery, source);
  await pool.query("INSERT INTO app.nft_discovery_policy VALUES('LOCAL',$1,true,false)", [source]);
  const api = createApi({ store: new PgStore(pool), config });
  await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
  t.after(() => { api.closeAllConnections(); api.close(); });
  const root = `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL`;
  const response = await (await fetch(root + `/discovery/accounts/${owner}/holdings`)).json();
  assert.equal(response.data.items[0].standard, "ERC1155");
  assert.equal(response.data.items[0].tokenId, "9007199254740993");
  assert.equal(response.data.items[0].balance, "340282366920938463463374607431768211456");
  assert.equal(response.data.items[0].settlementEligible, false);
  assert.equal((await pool.query("SELECT * FROM market.policies")).rowCount, 0);
});
