import { classifyContract } from "./nft-classify.mjs";
import { address } from "./domain.mjs";
/** Only exact reviewed envelopes are eligible for automatic projection.
 * Interface/ABI classification remains evidence even when no decoder is selected.
 */
export function decoderBinding(classification) {
  const result = classification;
  if (result.confidence !== "confirmed" || result.eventEnvelope !== "flat" ||
      result.implementationClassHash || result.uncertainty.some(u => /proxy/i.test(u))) return null;
  const types = { address: ["core::starknet::contract_address::ContractAddress", "ContractAddress"],
    u256: ["core::integer::u256", "u256"], legacyAddress: ["felt"], legacyU256: ["Uint256", "starkware.cairo.common.uint256.Uint256"],
    bool: ["core::bool", "bool"], span: ["core::array::Span::<core::integer::u256>", "Span<u256>"], byteArray: ["core::byte_array::ByteArray", "ByteArray"] };
  const fields = (layout, side, expected) => layout?.[side]?.length === expected.length &&
    layout[side].every((f, i) => f.name === expected[i][0] && types[expected[i][1]].includes(f.type));
  const event = name => result.eventLayouts.filter(e => e.name === name).length === 1 ? result.eventLayouts.find(e => e.name === name) : null;
  const empty = (layout, side) => fields(layout, side, []);
  const operator = event("ApprovalForAll"), approval = event("Approval");
  const transfer = event("Transfer");
  let decoderId;
  const keyedOperator = fields(operator, "keys", [["owner", "address"], ["operator", "address"]]) && fields(operator, "data", [["approved", "bool"]]);
  if (result.standard === "erc721" && fields(transfer, "keys", [["from", "address"], ["to", "address"], ["token_id", "u256"]]) && empty(transfer, "data") &&
      fields(approval, "keys", [["owner", "address"], ["approved", "address"], ["token_id", "u256"]]) && empty(approval, "data") && keyedOperator)
    decoderId = "erc721-cairo1-oz-2";
  else if (result.standard === "erc721" && fields(transfer, "data", [["from_", "legacyAddress"], ["to", "legacyAddress"], ["tokenId", "legacyU256"]]) && empty(transfer, "keys") &&
      fields(approval, "data", [["owner", "legacyAddress"], ["approved", "legacyAddress"], ["tokenId", "legacyU256"]]) && empty(approval, "keys") &&
      fields(operator, "data", [["owner", "legacyAddress"], ["operator", "legacyAddress"], ["approved", "legacyAddress"]]) && empty(operator, "keys"))
    decoderId = "erc721-cairo0-oz-0.6";
  else if (result.standard === "erc1155") {
    const single = event("TransferSingle"), batch = event("TransferBatch"), uri = event("URI"), keys = [["operator", "address"], ["from", "address"], ["to", "address"]];
    if (fields(single, "keys", keys) && fields(single, "data", [["id", "u256"], ["value", "u256"]]) &&
        fields(batch, "keys", keys) && fields(batch, "data", [["ids", "span"], ["values", "span"]]) && keyedOperator &&
        fields(uri, "keys", [["id", "u256"]]) && fields(uri, "data", [["value", "byteArray"]]))
      decoderId = "erc1155-cairo1-oz-2";
  }
  if (!decoderId) return null;
  return { address: address(result.address), standard: result.standard.toUpperCase(), decoderId,
    classHash: result.classHash, selectorPath: [], ignoredSelectors: [] };
}

/** Address-specific probes at every canonical class-change block, cached class ABI only.
 * Proxy/custom implementations are retained as unsupported until explicitly reviewed.
 */
export async function classifyDiscovery(store, rpc, { limit = 25 } = {}) {
  const head = await store.head();
  if (!head) return { classified: 0 };
  const candidates = await store.candidates(limit), cache = new Map(), results = [];
  for (const candidate of candidates) {
    const changes = await store.classChanges(candidate.address, 101);
    if (changes.length > 100) {
      const body = { standard: "unknown", state: "unsupported", reason: "class_history_budget_exceeded", evidence: [] };
      await store.classify(candidate.address, head.number, head.hash, body); results.push(body); continue;
    }
    const positions = [...new Map([...changes.map(c => [c.block_number, c.block_hash]), [head.number, head.hash]])];
    for (const [number, hash] of positions) {
      let body;
      try {
        const evidence = await classifyContract(rpc, candidate.address, { blockId: { block_hash: hash }, cache });
        const binding = decoderBinding(evidence);
        body = { ...evidence, binding, decoderId: binding?.decoderId ?? null,
          state: binding ? "supported" : "unsupported", reason: binding ? null : "unreviewed_decoder_or_identity",
          positionPrecision: "block_end", deploymentEvidence: Number(candidate.deployment_block) === Number(number) };
      } catch (error) {
        body = { standard: "unknown", state: "failed", reason: error.code ?? "classification_failed", evidence: [] };
      }
      await store.classify(candidate.address, Number(number), hash, body);
      results.push({ address: candidate.address, block: Number(number), ...body });
    }
  }
  return { classified: candidates.length, samples: results.length,
    supported: results.filter(r => r.state === "supported").length,
    unsupported: results.filter(r => r.state === "unsupported").length,
    failed: results.filter(r => r.state === "failed").length };
}
