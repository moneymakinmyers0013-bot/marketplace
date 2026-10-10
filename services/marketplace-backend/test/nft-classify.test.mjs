import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyContract,
  classifyMany,
  classIntervals,
  INTERFACE_IDS,
} from "../src/nft-classify.mjs";
import { selector, keccak256 } from "../src/starknet-keccak.mjs";

const fn = (name) => ({ type: "function", name, inputs: [], outputs: [] });
const ev = (name, keys, data) => ({
  type: "event",
  kind: "struct",
  name,
  members: [
    ...keys.map((n) => ({ name: n, type: "core::felt252", kind: "key" })),
    ...data.map((n) => ({
      name: n,
      type: "core::integer::u256",
      kind: "data",
    })),
  ],
});
const erc721Abi = [
  {
    type: "interface",
    name: "IERC721",
    items: [
      fn("owner_of"),
      fn("balance_of"),
      fn("transfer_from"),
      fn("safe_transfer_from"),
      fn("token_uri"),
      fn("supports_interface"),
    ],
  },
  ev("openzeppelin::ERC721Component::Transfer", ["from", "to", "token_id"], []),
];
const erc20Abi = [
  fn("balance_of"),
  fn("transfer_from"),
  fn("decimals"),
  ev("ERC20::Transfer", ["from", "to"], ["value"]),
];
const erc1155Abi = [
  fn("balance_of"),
  fn("balance_of_batch"),
  fn("safe_batch_transfer_from"),
  fn("supports_interface"),
  ev("TransferSingle", ["operator", "from", "to"], ["id", "value"]),
];
const legacy721 = [
  { type: "function", name: "ownerOf" },
  { type: "function", name: "transferFrom" },
  { type: "function", name: "supportsInterface" },
  {
    type: "event",
    name: "Transfer",
    keys: [],
    data: [
      { name: "from_", type: "felt" },
      { name: "to_", type: "felt" },
      { name: "token_id_", type: "Uint256" },
    ],
  },
];
const proxyAbi = [
  { type: "event", name: "Upgraded", keys: [], data: [] },
  { type: "function", name: "__default__" },
];

function fakeRpc({ classes, contracts }) {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push(method);
      if (method === "starknet_getClassHashAt") {
        const c = contracts[params[1]];
        if (!c) throw new Error("Contract not found");
        return typeof c.classHash === "function"
          ? c.classHash(params[0])
          : c.classHash;
      }
      if (method === "starknet_getClass") {
        const k = classes[params[1]];
        if (!k) throw new Error("Class not found");
        return k;
      }
      if (method === "starknet_getStorageAt")
        return contracts[params[0]].storage?.[params[1]] ?? "0x0";
      if (method === "starknet_call") {
        const c = contracts[params[0].contract_address];
        if (c.callThrows) throw new Error("ENTRYPOINT_FAILED");
        return [c.supports?.has(params[0].calldata[0]) ? "0x1" : "0x0"];
      }
      throw new Error(method);
    },
  };
}
const c1 = (abi) => ({ sierra_program: ["0x1"], abi: JSON.stringify(abi) });

test("keccak and Starknet selectors match known vectors", () => {
  assert.equal(
    Buffer.from(keccak256(new Uint8Array())).toString("hex"),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
  assert.equal(
    selector("Transfer"),
    "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9",
  );
});

test("ERC-20 emitting Transfer is rejected, not accepted as ERC-721", async () => {
  const rpc = fakeRpc({
    classes: { "0xc20": c1(erc20Abi) },
    contracts: { "0xa": { classHash: "0xc20" } },
  });
  const r = await classifyContract(rpc, "0xa");
  assert.equal(r.standard, "erc20");
  assert.equal(r.confidence, "rejected_fungible");
});

test("SRC5-confirmed ERC-721 records evidence, aliases and keyed Transfer layout", async () => {
  const rpc = fakeRpc({
    classes: { "0xc721": c1(erc721Abi) },
    contracts: {
      "0xa": {
        classHash: "0xc721",
        supports: new Set([INTERFACE_IDS.SRC5_ERC721]),
      },
    },
  });
  const r = await classifyContract(rpc, "0xa");
  assert.equal(r.standard, "erc721");
  assert.equal(r.confidence, "confirmed");
  assert.equal(r.methodAliases.owner_of, "owner_of");
  assert.deepEqual(
    r.eventLayouts.find((e) => e.name === "Transfer").keys.map((k) => k.name),
    ["from", "to", "token_id"],
  );
});

test("shared class evidence is cached while probes stay address-specific", async () => {
  const rpc = fakeRpc({
    classes: { "0xc721": c1(erc721Abi) },
    contracts: {
      "0xa": {
        classHash: "0xc721",
        supports: new Set([INTERFACE_IDS.SRC5_ERC721]),
      },
      "0xb": { classHash: "0xc721", supports: new Set() },
    },
  });
  const [a, b] = await classifyMany(rpc, ["0xa", "0xb"]);
  assert.equal(rpc.calls.filter((m) => m === "starknet_getClass").length, 1);
  assert.equal(a.confidence, "confirmed");
  assert.equal(b.confidence, "abi_only");
});

test("Cairo 0 legacy introspection, camelCase aliases and data-only Transfer layout", async () => {
  const rpc = fakeRpc({
    classes: { "0x1e9": { abi: legacy721 } },
    contracts: {
      "0xa": {
        classHash: "0x1e9",
        supports: new Set([INTERFACE_IDS.LEGACY_ERC721]),
      },
    },
  });
  const r = await classifyContract(rpc, "0xa");
  assert.equal(r.cairoVersion, 0);
  assert.equal(r.confidence, "confirmed");
  assert.equal(r.methodAliases.owner_of, "ownerOf");
  assert.ok(r.uncertainty.some((u) => u.startsWith("legacy Transfer layout")));
});

test("Cairo 0 proxy resolves implementation from storage and keeps proxy uncertainty", async () => {
  const slot = selector("Proxy_implementation_hash");
  const rpc = fakeRpc({
    classes: { "0xp": { abi: proxyAbi }, "0x1e9": { abi: legacy721 } },
    contracts: {
      "0xa": {
        classHash: "0xp",
        storage: { [slot]: "0x1e9" },
        supports: new Set([INTERFACE_IDS.LEGACY_ERC721]),
      },
      "0xb": { classHash: "0xp" },
    },
  });
  const [a, b] = await classifyMany(rpc, ["0xa", "0xb"]);
  assert.equal(a.standard, "erc721");
  assert.equal(a.implementationClassHash, "0x1e9");
  assert.ok(a.uncertainty[0].startsWith("proxy"));
  assert.equal(b.confidence, "unknown_retained");
});

test("ERC-1155 detected; failed probes and missing contracts do not stop other candidates", async () => {
  const rpc = fakeRpc({
    classes: { "0xm": c1(erc1155Abi), "0xc721": c1(erc721Abi) },
    contracts: {
      "0xa": {
        classHash: "0xm",
        supports: new Set([INTERFACE_IDS.SRC5_ERC1155]),
      },
      "0xb": { classHash: "0xc721", callThrows: true },
    },
  });
  const [a, b, c] = await classifyMany(rpc, ["0xa", "0xb", "0xmissing"]);
  assert.equal(a.standard, "erc1155");
  assert.equal(a.confidence, "confirmed");
  assert.equal(b.confidence, "abi_only");
  assert.ok(b.probeErrors.length > 0);
  assert.equal(c.confidence, "probe_failed");
});

test("unknown custom implementations are retained; upgrades produce class intervals", async () => {
  const rpc = fakeRpc({
    classes: { "0xx": c1([fn("mint")]), "0xc721": c1(erc721Abi) },
    contracts: {
      "0xa": {
        classHash: (b) => (b.block_number < 100 ? "0xx" : "0xc721"),
        supports: new Set([INTERFACE_IDS.SRC5_ERC721]),
      },
    },
  });
  const none = await classifyContract(
    fakeRpc({
      classes: { "0xx": c1([fn("mint")]) },
      contracts: { "0xz": { classHash: "0xx" } },
    }),
    "0xz",
  );
  assert.equal(none.confidence, "unknown_retained");
  const before = await classifyContract(rpc, "0xa", {
    blockId: { block_number: 10 },
  });
  const after = await classifyContract(rpc, "0xa", {
    blockId: { block_number: 100 },
  });
  assert.equal(after.confidence, "confirmed");
  const iv = classIntervals([
    { block: 100, ...after },
    { block: 10, ...before },
    { block: 150, ...after },
  ]);
  assert.deepEqual(
    iv.map((x) => [x.fromBlock, x.toBlock, x.classHash]),
    [
      [10, 99, "0xx"],
      [100, null, "0xc721"],
    ],
  );
});
