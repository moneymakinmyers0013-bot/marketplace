import test from "node:test";
import assert from "node:assert/strict";
import { decoderBinding, classifyDiscovery } from "../src/discovery-classify.mjs";
import { analyzeClass } from "../src/nft-classify.mjs";
const candidate = { address: "0x123", classHash: "0x456", standard: "erc721", confidence: "confirmed",
  eventEnvelope: "flat", uncertainty: [], eventLayouts: [
    { name: "Transfer", keys: [{ name: "from", type: "core::starknet::contract_address::ContractAddress" }, { name: "to", type: "core::starknet::contract_address::ContractAddress" }, { name: "token_id", type: "core::integer::u256" }], data: [] },
    { name: "Approval", keys: [{ name: "owner", type: "core::starknet::contract_address::ContractAddress" }, { name: "approved", type: "core::starknet::contract_address::ContractAddress" }, { name: "token_id", type: "core::integer::u256" }], data: [] },
    { name: "ApprovalForAll", keys: [{ name: "owner", type: "core::starknet::contract_address::ContractAddress" }, { name: "operator", type: "core::starknet::contract_address::ContractAddress" }], data: [{ name: "approved", type: "core::bool" }] },
  ] };
test("automatic binding requires exact known ABI, confirmed identity and flat envelope", () => {
  assert.equal(decoderBinding(candidate).decoderId, "erc721-cairo1-oz-2");
  assert.equal(decoderBinding({ ...candidate, eventEnvelope: "unreviewed" }), null);
  assert.equal(decoderBinding({ ...candidate, confidence: "introspection_only" }), null);
  assert.equal(decoderBinding({ ...candidate, uncertainty: ["proxy: implementation uncertain"] }), null);
  assert.equal(decoderBinding({ ...candidate, standard: "erc20" }), null);
  assert.equal(decoderBinding({ ...candidate, eventLayouts: [] }), null);
});
test("matching event names cannot bind custom field types, incomplete layouts or proxy implementations", () => {
  const custom = structuredClone(candidate);
  custom.eventLayouts[0].keys[2].type = "core::felt252";
  assert.equal(decoderBinding(custom), null);
  assert.equal(decoderBinding({ ...candidate, implementationClassHash: "0xabc" }), null);
  assert.equal(decoderBinding({ ...candidate, eventLayouts: candidate.eventLayouts.slice(0, 1) }), null);
});
test("nested component envelopes remain unreviewed rather than assuming leaf selector", () => {
  const klass = { sierra_program: [], abi: [{ type: "event", kind: "enum", name: "Event",
    variants: [{ name: "ERC721Event", kind: "nested", type: "ERC721Component::Event" }] }] };
  assert.equal(analyzeClass(klass).eventEnvelope, "unreviewed");
  klass.abi[0].variants[0].kind = "flat";
  assert.equal(analyzeClass(klass).eventEnvelope, "flat");
});
test("collection-local classification failure does not stop subsequent candidates", async () => {
  const classifications = [];
  const store = { async head() { return { number: 0, hash: "0x10" }; },
    async candidates() { return [{ address: "0x123" }, { address: "0x456" }]; },
    async classChanges() { return []; }, async classify(...args) { classifications.push(args); } };
  const result = await classifyDiscovery(store, { async call() { throw new Error("fixture outage"); } });
  assert.equal(result.classified, 2);
  assert.equal(result.failed, 2);
  assert.equal(classifications.length, 2);
});
