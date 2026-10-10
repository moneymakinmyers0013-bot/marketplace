import { address, ApiError } from "../domain.mjs";
import { createHash } from "node:crypto";
const position = row => row ? { number: Number(row.number), hash: row.hash } : null;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = block => createHash("sha256").update(JSON.stringify(canonical({ ...block,
  changes: [...block.changes].sort((a, b) => `${a.address}:${a.kind}`.localeCompare(`${b.address}:${b.kind}`)),
  events: [...block.events].sort((a, b) => a.transactionIndex - b.transactionIndex || a.eventIndex - b.eventIndex),
}))).digest("hex");
export class PgDiscoveryStore {
  constructor(pool, chain) {
    if (!["SN_MAIN", "SN_SEPOLIA", "LOCAL"].includes(chain)) throw new Error("Unknown discovery chain");
    this.pool = pool; this.chain = chain;
  }
  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('biblio-nft-discovery'),hashtext($1))", [this.chain]);
      const result = await work(client);
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async bind({ startBlock, chainId }) {
    return this.transaction(async c => {
      await c.query("INSERT INTO chain.nft_discovery_identity(chain,chain_id,coverage_start) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [this.chain, chainId, startBlock]);
      const identity = (await c.query("SELECT * FROM chain.nft_discovery_identity WHERE chain=$1", [this.chain])).rows[0];
      if (identity.chain_id !== chainId || Number(identity.coverage_start) !== startBlock)
        throw new ApiError("DISCOVERY_IDENTITY", "Discovery database chain or coverage start differs");
    });
  }
  async head(client = this.pool) {
    return position((await client.query("SELECT number,hash FROM chain.nft_discovery_blocks WHERE chain=$1 ORDER BY number DESC LIMIT 1", [this.chain])).rows[0]);
  }
  async commit(block, expected) {
    return this.transaction(async c => {
      const contentDigest = digest(block);
      const existing = (await c.query("SELECT hash,content_digest FROM chain.nft_discovery_blocks WHERE chain=$1 AND number=$2", [this.chain, block.number])).rows[0];
      if (existing?.hash === block.hash) {
        if (existing.content_digest !== contentDigest)
          throw new ApiError("DISCOVERY_CONTENT_CONFLICT", "Duplicate block has conflicting journal contents");
        return { duplicate: true };
      }
      const head = await this.head(c);
      if ((head?.hash ?? null) !== (expected?.hash ?? null) || (head?.number ?? null) !== (expected?.number ?? null))
        throw new ApiError("DISCOVERY_CHECKPOINT_CHANGED", "Discovery checkpoint changed; reacquire before retrying");
      const identity = (await c.query("SELECT * FROM chain.nft_discovery_identity WHERE chain=$1", [this.chain])).rows[0];
      if (!identity || block.number !== (head ? head.number + 1 : Number(identity.coverage_start)) ||
        (head && BigInt(block.parentHash) !== BigInt(head.hash)))
        throw new ApiError("DISCOVERY_CONTINUITY", "Discovery block does not extend canonical checkpoint");
      await c.query("INSERT INTO chain.nft_discovery_blocks VALUES($1,$2,$3,$4,$5,$6)", [this.chain, block.number, block.hash, block.parentHash, block.timestamp, contentDigest]);
      for (const change of block.changes) {
        const source = address(change.address);
        await c.query("INSERT INTO chain.nft_discovery_changes VALUES($1,$2,$3,$4,$5,$6,$7)",
          [this.chain, block.number, block.hash, source, change.kind, change.classHash, change.positionPrecision]);
        await c.query(`INSERT INTO chain.nft_catalog(chain,address,first_seen_block,deployment_block,class_hash,generation)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(chain,address) DO UPDATE SET
          class_hash=excluded.class_hash,status='candidate',generation=excluded.generation,
          deployment_block=COALESCE(chain.nft_catalog.deployment_block,excluded.deployment_block)`,
          [this.chain, source, block.number, change.kind === "deployment" ? block.number : null, change.classHash, identity.generation]);
      }
      for (const event of block.events) {
        const source = address(event.address);
        await c.query("INSERT INTO chain.nft_discovery_events VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [this.chain, block.number, block.hash, event.transactionHash, event.transactionIndex, event.eventIndex, source, event.raw]);
        await c.query("INSERT INTO chain.nft_catalog(chain,address,first_seen_block,generation) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [this.chain, source, block.number, identity.generation]);
      }
      // A retried range can succeed one block at a time. Retain only its uncovered suffix.
      const gaps = (await c.query("DELETE FROM chain.nft_discovery_gaps WHERE chain=$1 AND from_block<=$2 RETURNING *", [this.chain, block.number])).rows;
      for (const gap of gaps) if (Number(gap.to_block) > block.number)
        await c.query(`INSERT INTO chain.nft_discovery_gaps VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [this.chain, block.number + 1, gap.to_block, gap.reason, gap.retryable, gap.observed_at]);
      return { committed: true };
    });
  }
  async rewind(to, expected) {
    return this.transaction(async c => {
      const head = await this.head(c);
      if (expected !== undefined && ((head?.hash ?? null) !== (expected?.hash ?? null) || (head?.number ?? null) !== (expected?.number ?? null)))
        throw new ApiError("DISCOVERY_CHECKPOINT_CHANGED", "Discovery checkpoint changed; reacquire before rewinding");
      await c.query("DELETE FROM chain.nft_discovery_blocks WHERE chain=$1 AND number>$2", [this.chain, to]);
      await c.query("UPDATE chain.nft_discovery_identity SET generation=generation+1 WHERE chain=$1", [this.chain]);
      await c.query("DELETE FROM chain.nft_source_projections WHERE chain=$1", [this.chain]);
      // Rebuild only shadow discovery facts; market, application and media tables are untouched.
      await c.query(`DELETE FROM chain.nft_catalog c WHERE c.chain=$1 AND NOT EXISTS(
        SELECT 1 FROM chain.nft_discovery_changes x WHERE x.chain=c.chain AND x.address=c.address)
        AND NOT EXISTS(SELECT 1 FROM chain.nft_discovery_events e WHERE e.chain=c.chain AND e.address=c.address)`, [this.chain]);
      await c.query(`UPDATE chain.nft_catalog c SET class_hash=(SELECT x.class_hash FROM chain.nft_discovery_changes x
        WHERE x.chain=c.chain AND x.address=c.address ORDER BY x.block_number DESC,x.kind DESC LIMIT 1),
        deployment_block=(SELECT min(x.block_number) FROM chain.nft_discovery_changes x WHERE x.chain=c.chain AND x.address=c.address AND x.kind='deployment'),
        first_seen_block=(SELECT min(p.n) FROM (SELECT x.block_number n FROM chain.nft_discovery_changes x WHERE x.chain=c.chain AND x.address=c.address
          UNION ALL SELECT e.block_number FROM chain.nft_discovery_events e WHERE e.chain=c.chain AND e.address=c.address) p),
        status='candidate',generation=(SELECT i.generation FROM chain.nft_discovery_identity i WHERE i.chain=c.chain) WHERE c.chain=$1`, [this.chain]);
      await c.query("DELETE FROM chain.nft_discovery_probes WHERE chain=$1", [this.chain]);
    });
  }
  async classify(source, blockNumber, blockHash, body) {
    return this.transaction(async c => {
      const canonical = (await c.query("SELECT hash FROM chain.nft_discovery_blocks WHERE chain=$1 AND number=$2", [this.chain, blockNumber])).rows[0];
      if (canonical?.hash !== blockHash) throw new ApiError("CLASSIFICATION_ANCHOR", "Classification anchor is no longer canonical");
      const id = address(source);
      await c.query("INSERT INTO chain.nft_classifications VALUES($1,$2,$3,$4,$5) ON CONFLICT(chain,address,block_number) DO UPDATE SET body=excluded.body",
        [this.chain, id, blockNumber, blockHash, body]);
      await c.query("DELETE FROM chain.nft_source_projections WHERE chain=$1 AND address=$2", [this.chain, id]);
      await c.query("UPDATE chain.nft_catalog SET status=$3 WHERE chain=$1 AND address=$2",
        [this.chain, id, body.state === "supported" ? "syncing" : body.state === "failed" ? "failed" : "unsupported"]);
    });
  }
  async recordGap(gap) {
    await this.pool.query(`INSERT INTO chain.nft_discovery_gaps VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(chain,from_block,to_block) DO UPDATE SET reason=excluded.reason,retryable=excluded.retryable,observed_at=excluded.observed_at`,
      [this.chain, gap.from, gap.to, gap.reason, gap.retryable, gap.observedAt]);
  }
  async recordProbe(body) {
    await this.pool.query("INSERT INTO chain.nft_discovery_probes VALUES($1,$2) ON CONFLICT(chain) DO UPDATE SET body=excluded.body", [this.chain, body]);
  }
  async candidates(limit = 25) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Candidate limit 1–100 required");
    return (await this.pool.query("SELECT * FROM chain.nft_catalog WHERE chain=$1 AND status='candidate' ORDER BY first_seen_block,address LIMIT $2", [this.chain, limit])).rows;
  }
  async classChanges(source, limit = 100) {
    return (await this.pool.query("SELECT * FROM chain.nft_discovery_changes WHERE chain=$1 AND address=$2 ORDER BY block_number,kind LIMIT $3", [this.chain, address(source), limit])).rows;
  }
}
