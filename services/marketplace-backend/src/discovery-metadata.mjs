import { createHash } from "node:crypto";
import { decodeUri, fetchPublic, normalizeMetadata, parseDataUri, resolveMediaUri } from "./metadata.mjs";
import { parseTokenMetadata } from "./metadata-data.mjs";
import { selector } from "./starknet-keccak.mjs";
import { u256Felts, ApiError } from "./domain.mjs";
/** Bounded shadow metadata work; fixed-block URI reads, SSRF-safe origin fetches and explicit failures. */
export async function refreshDiscoveryMetadata(store, rpc, { limit = 10, now = Date.now(), fetchResource = fetchPublic, ipfsGateway } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("INVALID_METADATA_BUDGET", "Metadata limit must be 1–100");
  const tokens = (await store.pool.query(`SELECT t.*,s.generation,s.block_hash,x.body classification
    FROM chain.nft_tokens t JOIN chain.nft_source_projections s USING(chain,address)
    LEFT JOIN chain.nft_metadata_cache m USING(chain,address,token_id)
    JOIN LATERAL(SELECT body FROM chain.nft_classifications WHERE chain=t.chain AND address=t.address ORDER BY block_number DESC LIMIT 1) x ON true
    WHERE t.chain=$1 AND NOT COALESCE((t.body->>'burned')::boolean,false)
    AND (m.token_id IS NULL OR m.generation<>s.generation OR m.body->>'revision' IS DISTINCT FROM t.body->>'metadataRevision' OR m.next_attempt<=$2)
    ORDER BY COALESCE(m.next_attempt,0),t.address,t.token_id LIMIT $3`, [store.chain, now, limit])).rows;
  const result = { attempted: 0, ready: 0, failed: 0, stale: 0 };
  for (const token of tokens) {
    result.attempted++;
    let body;
    try {
      const method = token.body.standard === "ERC1155" ? token.classification.methodAliases?.uri : token.classification.methodAliases?.token_uri;
      if (!method) throw new ApiError("UNSUPPORTED_METADATA", "No reviewed metadata entry point");
      const calldata = u256Felts(token.token_id).map(limb => "0x" + BigInt(limb).toString(16));
      const response = await rpc.call("starknet_call", [{ contract_address: token.address, entry_point_selector: selector(method), calldata }, { block_hash: token.block_hash }]);
      const uri = decodeUri(response).replaceAll("{id}", BigInt(token.token_id).toString(16).padStart(64, "0"));
      const inline = parseDataUri(uri, 2 * 1024 * 1024);
      if (inline && !["application/json", "text/plain"].includes(inline.mime)) throw new Error("Unsupported inline metadata type");
      const bytes = inline?.bytes ?? (await fetchResource(resolveMediaUri(uri, ipfsGateway), { maxBytes: 2 * 1024 * 1024 })).bytes;
      if (bytes.length > 2 * 1024 * 1024) throw new Error("Metadata exceeds size limit");
      const metadata = normalizeMetadata(parseTokenMetadata(bytes.toString()));
      // Origin media is not downloaded here; the public catalog displays textual metadata only.
      body = { metadata: { name: metadata.name, description: metadata.description, attributes: metadata.attributes }, uri, revision: token.body.metadataRevision,
        contentHash: createHash("sha256").update(bytes).digest("hex"), status: "ready", observedAt: now, blockHash: token.block_hash };
    } catch (error) { body = { metadata: {}, status: "failed", code: error.code ?? "METADATA_FAILED", revision: token.body.metadataRevision, observedAt: now, blockHash: token.block_hash }; }
    const wrote = await store.transaction(async client => {
      const current = (await client.query("SELECT generation,block_hash FROM chain.nft_source_projections WHERE chain=$1 AND address=$2", [store.chain, token.address])).rows[0];
      if (current?.generation !== token.generation || current.block_hash !== token.block_hash) return false;
      await client.query(`INSERT INTO chain.nft_metadata_cache VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(chain,address,token_id) DO UPDATE SET generation=excluded.generation,block_hash=excluded.block_hash,next_attempt=excluded.next_attempt,body=excluded.body`,
        [store.chain, token.address, token.token_id, token.generation, token.block_hash, now + (body.status === "ready" ? 21600000 : 300000), body]);
      return true;
    });
    if (!wrote) result.stale++; else result[body.status]++;
  }
  return result;
}
