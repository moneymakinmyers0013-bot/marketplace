import { address, uint, ApiError } from "./domain.mjs";
const equal = (a, b) => BigInt(a) === BigInt(b);
const felt = value => {
  const n = BigInt(uint(value, 252));
  if (n >= (1n << 251n) + 17n * (1n << 192n) + 1n)
    throw new ApiError("INVALID_FELT", "Discovery value exceeds the Starknet field");
  return `0x${n.toString(16)}`;
};
export function prepareDiscoveryBlock(block, update) {
  if (!Number.isSafeInteger(block.block_number) || block.block_number < 0 ||
      !["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(block.status) ||
      !Array.isArray(block.transactions) || !Number.isSafeInteger(block.timestamp))
    throw new ApiError("INVALID_DISCOVERY_BLOCK", "Expected accepted full receipts");
  if (!update.block_hash || !equal(update.block_hash, block.block_hash))
    throw new ApiError("DISCOVERY_IDENTITY", "State update and receipt block identity differ");
  const diff = update.state_diff;
  if (!diff || !Array.isArray(diff.deployed_contracts) || !Array.isArray(diff.replaced_classes))
    throw new ApiError("INVALID_STATE_UPDATE", "Missing deployed or replaced class history");
  const changes = [], seen = new Set();
  for (const [kind, entries] of [["deployment", diff.deployed_contracts], ["replacement", diff.replaced_classes]]) {
    for (const row of entries) {
      const contract = address(row.address ?? row.contract_address), key = `${kind}:${contract}`;
      if (seen.has(key)) throw new ApiError("INVALID_STATE_UPDATE", "Duplicate state-diff contract");
      seen.add(key);
      changes.push({ kind, address: contract, classHash: felt(row.class_hash), positionPrecision: "block_end" });
    }
  }
  const events = [], transactions = new Set();
  for (const [transactionIndex, { transaction, receipt }] of block.transactions.entries()) {
    if (!receipt || !Array.isArray(receipt.events) ||
        !["SUCCEEDED", "REVERTED"].includes(receipt.execution_status))
      throw new ApiError("INVALID_RECEIPT", "Missing receipt or execution status");
    const transactionHash = felt(receipt.transaction_hash);
    if ((transaction?.transaction_hash !== undefined && !equal(transactionHash, transaction.transaction_hash)) || transactions.has(transactionHash))
      throw new ApiError("INVALID_RECEIPT", "Conflicting or duplicate transaction identity");
    transactions.add(transactionHash);
    if (receipt.execution_status === "REVERTED") continue;
    for (const [eventIndex, raw] of receipt.events.entries()) {
      if (!Array.isArray(raw.keys) || !Array.isArray(raw.data))
        throw new ApiError("INVALID_RECEIPT", "Malformed receipt event");
      events.push({ address: address(raw.from_address), transactionHash, transactionIndex, eventIndex,
        raw: { from_address: address(raw.from_address), keys: raw.keys.map(felt), data: raw.data.map(felt) } });
    }
  }
  return { number: block.block_number, hash: felt(block.block_hash), parentHash: felt(block.parent_hash),
    timestamp: block.timestamp, changes, events };
}

/** One bounded, fixed-anchor scan. Receipt acquisition is shared across every emitter.
 * This is a shadow discovery journal, independent of the existing settlement scanner.
 */
export async function scanDiscovery(store, rpc, config, { window = 25, stopAt, maxRewind = 100, maxAcquisitionBytes = 64 * 1024 * 1024, now = Date.now } = {}) {
  if (!Number.isSafeInteger(window) || window < 1 || window > 100 ||
      !Number.isSafeInteger(config.startBlock) || config.startBlock < 0 ||
      (stopAt !== undefined && (!Number.isSafeInteger(stopAt) || stopAt < 0)) ||
      !Number.isSafeInteger(maxAcquisitionBytes) || maxAcquisitionBytes < 1 ||
      !Number.isSafeInteger(maxRewind) || maxRewind < 1 || maxRewind > 1000)
    throw new ApiError("INVALID_DISCOVERY_WINDOW", "Use a verified start and 1–100 block window");
  if (store.chain && store.chain !== config.chain)
    throw new ApiError("CHAIN_MISMATCH", "Discovery store is bound to another chain");
  const endpoint = rpc.urls?.[0], options = { endpoint }, started = now();
  let rpcCalls = 0, rpcBytes = 0;
  const call = async (method, params) => {
    rpcCalls++;
    const result = await rpc.call(method, params, options);
    rpcBytes += Buffer.byteLength(JSON.stringify(result));
    if (rpcBytes > maxAcquisitionBytes)
      throw new ApiError("DISCOVERY_BYTE_BUDGET", "Discovery acquisition exceeded the byte budget; reduce the window");
    return result;
  };
  if (!equal(await call("starknet_chainId", []), config.chainId))
    throw new ApiError("CHAIN_MISMATCH", "Discovery RPC is on another chain");
  const spec = await call("starknet_specVersion", []);
  if (!/^0\.(8|9|10)\./.test(spec))
    throw new ApiError("UNSUPPORTED_DISCOVERY_RPC", "Discovery requires reviewed RPC 0.8–0.10 receipts/state updates");
  await store.bind({ startBlock: config.startBlock, chainId: felt(config.chainId) });
  let head = await store.head();
  const latest = await call("starknet_getBlockWithTxHashes", { block_id: "latest" });
  if (!Number.isSafeInteger(latest.block_number) || !["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(latest.status))
    throw new ApiError("UNACCEPTED_HEAD", "Discovery head must be accepted");
  let rewound = 0;
  while (head) {
    const canonical = await call("starknet_getBlockWithTxHashes", { block_id: { block_number: head.number } });
    if (equal(canonical.block_hash, head.hash)) break;
    if (rewound >= maxRewind) {
      await store.recordGap({ from: head.number, to: latest.block_number, reason: "DISCOVERY_REWIND_BUDGET", retryable: true, observedAt: now() });
      throw new ApiError("DISCOVERY_REWIND_BUDGET", "Canonical ancestor exceeds the rewind budget; retry with a reviewed recovery range");
    }
    await store.rewind(head.number - 1, head);
    rewound++;
    head = await store.head();
  }
  const from = head ? head.number + 1 : config.startBlock;
  const end = Math.min(latest.block_number, from + window - 1, stopAt ?? Infinity);
  if (from > end) return { indexed: head?.number ?? null, head: latest.block_number, blocks: 0, rpcCalls, rpcBytes };
  const staged = [];
  let anchor;
  try {
    anchor = await call("starknet_getBlockWithTxHashes", { block_id: { block_number: end } });
    for (let number = from; number <= end; number++) {
      const block = await call("starknet_getBlockWithReceipts", { block_id: { block_number: number } });
      if (block.block_number !== number)
        throw new ApiError("DISCOVERY_IDENTITY", "Receipt block returned another height");
      const update = await call("starknet_getStateUpdate", { block_id: { block_hash: block.block_hash } });
      const prepared = prepareDiscoveryBlock(block, update), parent = staged.at(-1) ?? head;
      if (parent && !equal(prepared.parentHash, parent.hash))
        throw new ApiError("CHAIN_CONFLICT", "Discovery parent changed during acquisition");
      staged.push(prepared);
    }
    const check = await call("starknet_getBlockWithTxHashes", { block_id: { block_number: end } });
    if (!equal(anchor.block_hash, check.block_hash) || !equal(staged.at(-1).hash, anchor.block_hash))
      throw new ApiError("CHAIN_CONFLICT", "Discovery range anchor changed during acquisition");
    await store.recordProbe({ spec, from, to: end, hash: felt(anchor.block_hash), headObserved: latest.block_number,
      headHash: felt(latest.block_hash), stateUpdates: true, receipts: true, observedAt: now(), rpcCalls, rpcBytes });
  } catch (error) {
    const code = error.details?.rpcCode;
    await store.recordGap({ from, to: end, reason: code === 24 ? "historical_unavailable" :
      code === -32601 ? "capability_unavailable" : error.code ?? "acquisition_failed",
      retryable: ![24, -32601].includes(code), observedAt: now() });
    throw error;
  }
  for (const b of staged) { await store.commit(b, head); head = { number: b.number, hash: b.hash }; }
  const elapsedMs = Math.max(1, now() - started);
  return { indexed: end, hash: head.hash, head: latest.block_number, blocks: staged.length,
    changes: staged.reduce((n, b) => n + b.changes.length, 0), events: staged.reduce((n, b) => n + b.events.length, 0),
    rpcCalls, rpcBytes, elapsedMs, blocksPerSecond: staged.length * 1000 / elapsedMs,
    coverageStart: config.startBlock, discoveryRangeStartsAtGenesis: config.startBlock === 0 };
}
