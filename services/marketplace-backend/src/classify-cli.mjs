#!/usr/bin/env node
// Usage: STARKNET_RPC_URL=<url> node src/classify-cli.mjs [--block <n|latest>] <address>...
// Prints one JSON classification per line. Read-only RPC calls only.
import { RpcClient } from "./rpc.mjs";
import { classifyMany } from "./nft-classify.mjs";
const args = process.argv.slice(2);
let blockId = "latest";
const i = args.indexOf("--block");
if (i >= 0) {
  const v = args.splice(i, 2)[1];
  blockId = v === "latest" ? v : { block_number: Number(v) };
}
if (!args.length) {
  console.error("usage: classify-cli.mjs [--block n] <address>...");
  process.exit(2);
}
const rpc = new RpcClient([
  process.env.STARKNET_RPC_URL ?? "https://starknet-rpc.publicnode.com",
]);
for (const r of await classifyMany(rpc, args, { blockId }))
  console.log(JSON.stringify(r));
