import { createHash } from "node:crypto";
import { address, boundedInteger, ApiError } from "../domain.mjs";
export class PgDiscoveryCatalog {
  constructor(store, chain) { this.store = store; this.chain = chain; }
  async identity() {
    return (await this.store.query("SELECT * FROM chain.nft_discovery_identity WHERE chain=$1", [this.chain])).rows[0] ?? null;
  }
  async page(sql, values, query, scope, idColumn = "id") {
    const limit = boundedInteger(query.limit, 20, 100), identity = await this.identity();
    const generation = identity?.generation ?? "0", digest = createHash("sha256").update(JSON.stringify({ chain: this.chain, scope })).digest("hex");
    let cursor = null;
    if (query.cursor) {
      try { if (query.cursor.length > 2048) throw new Error(); cursor = JSON.parse(Buffer.from(query.cursor, "base64url")); } catch { throw new ApiError("CURSOR_MISMATCH", "Invalid discovery cursor"); }
      if (cursor.scope !== digest || cursor.generation !== generation || typeof cursor.id !== "string")
        throw new ApiError("CURSOR_MISMATCH", "Discovery cursor belongs to another query or generation");
    }
    const rows = (await this.store.query(`SELECT * FROM (${sql}) page WHERE ${idColumn}>$${values.length + 1} ORDER BY ${idColumn} LIMIT $${values.length + 2}`, [...values, cursor?.id ?? "", limit + 1])).rows;
    const more = rows.length > limit; if (more) rows.pop();
    return { items: rows.map(r => r.body), nextCursor: more ? Buffer.from(JSON.stringify({ scope: digest, generation, id: rows.at(-1).id })).toString("base64url") : null,
      chain: this.chain, generation, settlementEligible: false, tokenCoverage: "unproven" };
  }
  async visible(source) {
    if (!(await this.store.query(`SELECT 1 FROM chain.nft_catalog c JOIN app.nft_discovery_policy p USING(chain,address)
      WHERE c.chain=$1 AND c.address=$2 AND p.visible AND NOT EXISTS(SELECT 1 FROM app.moderation h WHERE h.collection=c.address)`, [this.chain, address(source)])).rowCount)
      throw new ApiError("NOT_FOUND", "Discovered collection is not published", 404);
  }
  async collections(query = {}) {
    const q = query.q ?? "";
    if (typeof q !== "string" || q.length > 100) throw new ApiError("INVALID_QUERY", "Discovery search is limited to 100 characters");
    return this.page(`SELECT c.address id,jsonb_build_object('address',c.address,'name',c.address,'chain',c.chain,
      'standard',x.body->>'standard','status',c.status,'verified',p.verified,'settlementEligible',false,
      'checkpoint',s.body->'checkpoint','coverage',COALESCE(s.body->'coverage','{"historicalComplete":false,"reconciliation":"not_run"}'::jsonb),
      'tokenCount',(SELECT count(*)::text FROM chain.nft_tokens t WHERE t.chain=c.chain AND t.address=c.address AND NOT COALESCE((t.body->>'burned')::boolean,false))) body
      FROM chain.nft_catalog c JOIN app.nft_discovery_policy p USING(chain,address)
      LEFT JOIN chain.nft_source_projections s USING(chain,address)
      LEFT JOIN LATERAL(SELECT body FROM chain.nft_classifications WHERE chain=c.chain AND address=c.address ORDER BY block_number DESC LIMIT 1) x ON true
      WHERE c.chain=$1 AND p.visible AND NOT EXISTS(SELECT 1 FROM app.moderation h WHERE h.collection=c.address)
      AND x.body->>'standard' IN ('erc721','erc1155') AND c.address LIKE $2`, [this.chain, `%${q.toLowerCase().replace(/^0x/, "")}%`], query, { resource: "collections", q });
  }
  async tokens(source, query = {}) {
    const id = address(source); await this.visible(id);
    const page = await this.page(`SELECT lpad(t.token_id::text,78,'0') id,t.body || jsonb_build_object('metadata',COALESCE(m.body->'metadata','{}'::jsonb),
      'metadataStatus',COALESCE(m.body->>'status','pending'),'metadataObservedAt',m.body->'observedAt') body
      FROM chain.nft_tokens t JOIN chain.nft_source_projections s USING(chain,address)
      LEFT JOIN chain.nft_metadata_cache m ON m.chain=t.chain AND m.address=t.address AND m.token_id=t.token_id AND m.generation=s.generation AND m.body->>'revision'=t.body->>'metadataRevision'
      WHERE t.chain=$1 AND t.address=$2 AND NOT COALESCE((t.body->>'burned')::boolean,false)`, [this.chain, id], query, { resource: "tokens", source: id });
    const sourceState = (await this.store.query("SELECT block_number::text,block_hash,body->'coverage' coverage,body->>'state' state FROM chain.nft_source_projections WHERE chain=$1 AND address=$2", [this.chain, id])).rows[0] ?? null;
    return { ...page, source: sourceState };
  }
  async holdings(account, query = {}) {
    const owner = address(account), collection = query.collection ? address(query.collection) : null;
    return this.page(`SELECT h.address||':'||lpad(h.token_id::text,78,'0') id,h.body body
      FROM chain.nft_holdings h JOIN app.nft_discovery_policy p USING(chain,address)
      WHERE h.chain=$1 AND h.account=$2 AND p.visible AND ($3::text IS NULL OR h.address=$3)
      AND NOT EXISTS(SELECT 1 FROM app.moderation m WHERE m.collection=h.address)`, [this.chain, owner, collection], query, { resource: "holdings", owner, collection });
  }
  async status() {
    const identity = await this.identity();
    const head = (await this.store.query("SELECT number::text,hash FROM chain.nft_discovery_blocks WHERE chain=$1 ORDER BY number DESC LIMIT 1", [this.chain])).rows[0] ?? null;
    const counts = (await this.store.query("SELECT status,count(*)::text count FROM chain.nft_catalog WHERE chain=$1 GROUP BY status ORDER BY status", [this.chain])).rows;
    const gaps = (await this.store.query("SELECT * FROM chain.nft_discovery_gaps WHERE chain=$1 ORDER BY from_block LIMIT 100", [this.chain])).rows;
    const metadata = (await this.store.query("SELECT body->>'status' status,count(*)::text count FROM chain.nft_metadata_cache WHERE chain=$1 GROUP BY body->>'status'", [this.chain])).rows;
    const probe = (await this.store.query("SELECT body FROM chain.nft_discovery_probes WHERE chain=$1", [this.chain])).rows[0]?.body ?? null;
    const lagBlocks = head && probe?.headObserved != null ? Math.max(0, probe.headObserved - Number(head.number)) : null;
    return { chain: this.chain, identity, checkpoint: head, counts, gaps, metadata, probe, lagBlocks, settlementEligible: false, tokenCoverage: "unproven", historicalComplete: false };
  }
}
