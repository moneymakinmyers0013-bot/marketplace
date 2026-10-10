import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { address, MAX_U256, u256Felts } from "../src/domain.mjs";
import { selector } from "../src/starknet-keccak.mjs";
import {
  decodeNftEvent, NFT_ADAPTERS, NFT_SELECTORS, selectNftDecoder,
} from "../src/nft-decoders.mjs";

const binding = (decoderId = "erc721-cairo1-oz-2", extra = {}) => ({
  address: "0x9", standard: decoderId.startsWith("erc1155") ? "ERC1155" : "ERC721",
  decoderId, ...extra,
});
const raw = (name, keys = [], data = []) => ({
  from_address: "0x9", keys: [NFT_SELECTORS[name], ...keys], data,
});
const decoded = (event, profile = binding(), context = {}) => {
  const result = decodeNftEvent(event, profile, context);
  assert.equal(result.status, "decoded", JSON.stringify(result.error));
  return result.events;
};

test("Cairo 1 ERC721 preserves keyed mint/transfer/burn and all u256 bits", () => {
  const input = raw("Transfer", ["0", "0x2", ...u256Felts(MAX_U256)]);
  const result = decodeNftEvent(input, binding());
  assert.equal(result.events[0].tokenId, MAX_U256.toString());
  assert.equal(result.events[0].type, "transfer");
  assert.equal(result.events[0].from, address("0"));
  assert.equal(result.events[0].standard, "ERC721");
  assert.equal(result.decoder.id, "erc721-cairo1-oz-2");
  assert.equal(result.decoder.version, 1);
  assert.deepEqual(result.raw, input);
  assert.equal(decoded(raw("Transfer", ["0x2", "0", "4", "0"]))[0].to, address("0"));
});

test("Cairo 0 unkeyed layout is explicit and cannot reinterpret ERC20 amounts", () => {
  const legacy = binding("erc721-cairo0-oz-0.6");
  assert.equal(decoded(raw("Transfer", [], ["0", "0x2", "9007199254740993", "0"]), legacy)[0].tokenId, "9007199254740993");
  assert.equal(decodeNftEvent(raw("Transfer", ["0", "0x2", "5", "0"]), legacy).status, "quarantined");
  assert.equal(decodeNftEvent(raw("Transfer", [], ["0", "0x2", "5", "0"]), binding()).status, "quarantined");
  assert.equal(decodeNftEvent(raw("Transfer", [], ["0", "0x2", "5", "0"]), {...legacy,standard:"ERC20"}).status, "quarantined");
});

test("reviewed compatibility adapter retains frozen Realms receipts and fixed splits", () => {
  const fixture = JSON.parse(readFileSync(new URL("fixtures/realms-transfers.json", import.meta.url), "utf8"));
  for (const event of fixture.events) {
    const result = decodeNftEvent(event, binding("erc721-reviewed-v1", {address: event.from_address}));
    assert.equal(result.status, "decoded");
    assert.equal(result.events[0].tokenId, BigInt(event.keys[3]).toString());
  }
  const profile = binding("erc721-reviewed-v1");
  assert.equal(decoded(raw("Transfer", [], ["0", "2", "5", "0"]),profile)[0].tokenId,"5");
  assert.equal(decodeNftEvent(raw("Transfer", ["0"], ["2","5","0"]),profile).status,"quarantined");
});

test("component selector paths are exact, never scanned for a familiar leaf", () => {
  const nested = {...raw("Transfer", ["0", "2", "4", "0"]),keys:["0x123","0x456",NFT_SELECTORS.Transfer,"0","2","4","0"]};
  const profile = binding("erc721-cairo1-oz-2", {selectorPath:["0x123","0x456"]});
  assert.equal(decoded(nested, profile)[0].tokenId, "4");
  assert.equal(decodeNftEvent(nested, binding()).status,"quarantined");
  assert.equal(decodeNftEvent({...nested,keys:["0x123","0x457",...nested.keys.slice(2)]},profile).status,"quarantined");
});

test("approvals honor keyed addresses, data booleans, and transfer semantics", () => {
  assert.equal(decoded(raw("Approval",["2","3","5","0"]))[0].spender,address("3"));
  assert.equal(decoded(raw("ApprovalForAll",["2","3"],["1"]))[0].approved,true);
  assert.equal(decoded(raw("ApprovalForAll",[],["2","3","0"]),binding("erc721-cairo0-oz-0.6"))[0].approved,false);
  assert.equal(decodeNftEvent(raw("ApprovalForAll",["2","3"],["2"]),binding()).status,"quarantined");
});

test("field validation rejects out-of-field felts, oversized limbs, bad addresses and trailing data", () => {
  const prime = (1n<<251n) + 17n*(1n<<192n) + 1n;
  for (const event of [
    raw("Transfer",["0","2",(1n<<128n).toString(),"0"]),
    raw("Transfer",["0",((1n<<251n)-256n).toString(),"5","0"]),
    raw("Transfer",["0","2","5","0"],["0"]),
    raw("Transfer",["0","2","5"]),
    raw("Transfer",["0","0","5","0"]),
    {from_address:"0x9",keys:[prime.toString()],data:[]},
  ]) {
    const result = decodeNftEvent(event,binding());
    assert.equal(result.status,"quarantined");
    assert.equal(result.events.length,0);
    assert.deepEqual(result.raw,event);
    assert.ok(result.error.code);
  }
});

test("historical adapters are selected by exact block interval and class evidence", () => {
  const profile = binding(undefined,{versions:[
    {fromBlock:10,toBlock:19,classHash:"0xa",decoderId:"erc721-cairo0-oz-0.6"},
    {fromBlock:20,classHash:"0xb",decoderId:"erc721-cairo1-oz-2"},
  ]});
  assert.equal(selectNftDecoder(profile,{blockNumber:19,classHash:"0xa"}).decoderId,"erc721-cairo0-oz-0.6");
  assert.equal(selectNftDecoder(profile,{blockNumber:20,classHash:"0xb"}).decoderId,"erc721-cairo1-oz-2");
  assert.throws(()=>selectNftDecoder(profile,{blockNumber:20,classHash:"0xa"}),/class/i);
  assert.throws(()=>selectNftDecoder(profile,{blockNumber:9,classHash:"0xa"}),/historical/i);
  assert.throws(()=>selectNftDecoder({...profile,versions:[...profile.versions,{fromBlock:15,decoderId:"erc721-cairo1-oz-2"}]},{blockNumber:16,classHash:"0xa"}),/overlap/i);
  assert.equal(decoded(raw("Transfer",[],["0","2","5","0"]),profile,{blockNumber:19,classHash:"0xa"})[0].tokenId,"5");
  assert.equal(decoded(raw("Transfer",["0","2","5","0"]),profile,{blockNumber:20,classHash:"0xb"})[0].tokenId,"5");
  assert.equal(decodeNftEvent(raw("Transfer",[],["0","2","5","0"]),profile,{blockNumber:20,classHash:"0xb"}).status,"quarantined");
});

test("all NFT selector constants match the owned Starknet Keccak implementation", () => {
  for(const [name,value] of Object.entries(NFT_SELECTORS)) assert.equal(value,selector(name));
});

test("unsupported raw events remain replayable, ignored selectors require explicit binding", () => {
  const event = {from_address:"0x9",keys:["0xdead"],data:["7"]};
  const unknown = decodeNftEvent(event,binding());
  assert.equal(unknown.error.code,"UNKNOWN_NFT_EVENT");
  assert.deepEqual(unknown.raw,event);
  assert.equal(decodeNftEvent(event,binding(undefined,{ignoredSelectors:["0xdead"]})).status,"ignored");
  assert.equal(decodeNftEvent(raw("Transfer",[],[]),binding(undefined,{ignoredSelectors:[NFT_SELECTORS.Transfer]})).status,"quarantined");
  assert.equal(decodeNftEvent(event,binding("unsupported-custom")).error.code,"UNKNOWN_NFT_DECODER");
});

test("entrypoint capability names preserve explicit snake/camel provenance", () => {
  assert.deepEqual(NFT_ADAPTERS["erc721-cairo1-oz-2"].readMethods.owner,["owner_of","ownerOf"]);
  assert.deepEqual(NFT_ADAPTERS["erc721-cairo0-oz-0.6"].readMethods.balance,["balance_of","balanceOf"]);
  assert.equal(NFT_ADAPTERS["erc721-cairo0-oz-0.6"].evidence.version,"v0.6.1");
});

test("metadata ranges and ERC1155 ByteArray URI are validated losslessly", () => {
  const reviewed = binding("erc721-reviewed-v1");
  assert.equal(decoded(raw("MetadataUpdate",["5","0"]),reviewed)[0].tokenId,"5");
  assert.equal(decoded(raw("BatchMetadataUpdate",[],["5","0","9","0"]),reviewed)[0].toTokenId,"9");
  assert.equal(decodeNftEvent(raw("BatchMetadataUpdate",[],["9","0","5","0"]),reviewed).status,"quarantined");
  const multi = binding("erc1155-cairo1-oz-2");
  const event = raw("URI",[...u256Felts(MAX_U256)],["0","0x697066733a2f2f78","8"]);
  const update = decoded(event,multi)[0];
  assert.equal(update.uri,"ipfs://x");
  assert.equal(update.tokenId,MAX_U256.toString());
  assert.equal(decodeNftEvent({...event,data:["0","256","1"]},multi).status,"quarantined");
});

test("ERC1155 single and batch values are exact and repeated IDs retain subrecord identity", () => {
  const profile = binding("erc1155-cairo1-oz-2");
  const single = decoded(raw("TransferSingle",["3","0","2"],[...u256Felts(MAX_U256),...u256Felts(MAX_U256)]),profile)[0];
  assert.equal(single.quantity,MAX_U256.toString());
  assert.equal(single.type,"balance_transfer");
  const batch = decoded(raw("TransferBatch",["3","0","2"],["2","5","0","5","0","2","7","0","9","0"]),profile);
  assert.deepEqual(batch.map(e=>[e.tokenId,e.quantity,e.subrecordIndex]),[["5","7",0],["5","9",1]]);
  assert.ok(batch.every(e=>e.standard==="ERC1155"));
});

test("ERC1155 batch lengths, truncation and unexpected partitions quarantine the whole raw event", () => {
  const profile = binding("erc1155-cairo1-oz-2");
  for(const event of [
    raw("TransferBatch",["3","0","2"],["2","5","0","6","0","1","7","0"]),
    raw("TransferBatch",["3","0","2"],["2","5","0"]),
    raw("TransferBatch",["3","0","2"],["0","0","9"]),
    raw("TransferSingle",[],["3","0","2","5","0","9","0"]),
  ]) assert.equal(decodeNftEvent(event,profile).status,"quarantined");
  assert.deepEqual(decoded(raw("TransferBatch",["3","0","2"],["0","0"]),profile),[]);
});

test("ERC1155 zero-balance existence announcements are decoded without manufacturing inventory", () => {
  const profile=binding("erc1155-cairo1-oz-2");
  assert.equal(decoded(raw("TransferSingle",["3","0","0"],["5","0","0","0"]),profile)[0].quantity,"0");
  assert.equal(decodeNftEvent(raw("TransferSingle",["3","0","0"],["5","0","1","0"]),profile).status,"quarantined");
});
