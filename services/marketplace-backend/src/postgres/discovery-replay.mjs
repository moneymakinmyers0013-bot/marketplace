import { address, ApiError } from "../domain.mjs";
import { replayNftJournal } from "../nft-projections.mjs";

/** Bounded reference replay of one source into its own shadow generation.
 * The shared canonical journal is acquired once, unrelated market/app/media state
 * is never rewritten. A source is not promoted without independent reconciliation.
 */
export async function replayDiscoveredSource(store, source, { maxEvents = 20000 } = {}) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000)
    throw new ApiError("INVALID_SOURCE_BUDGET", "Source replay budget must be 1–100000 events");
  const id = address(source), chain = store.chain;
  return store.transaction(async client => {
    const head = await store.head(client);
    if (!head) throw new ApiError("DISCOVERY_EMPTY", "Canonical discovery journal is empty");
    const identity = (await client.query("SELECT * FROM chain.nft_discovery_identity WHERE chain=$1", [chain])).rows[0];
    const catalog = (await client.query("SELECT * FROM chain.nft_catalog WHERE chain=$1 AND address=$2", [chain, id])).rows[0];
    if (!catalog) throw new ApiError("SOURCE_NOT_DISCOVERED", "Source was not discovered on this chain");
    const prior = (await client.query("SELECT * FROM chain.nft_source_projections WHERE chain=$1 AND address=$2", [chain, id])).rows[0];
    if (prior?.block_hash === head.hash && prior.generation === identity.generation) return prior.body;
    const samples = (await client.query("SELECT block_number,body FROM chain.nft_classifications WHERE chain=$1 AND address=$2 ORDER BY block_number", [chain, id])).rows;
    const replacements = (await client.query("SELECT block_number FROM chain.nft_discovery_changes WHERE chain=$1 AND address=$2 AND kind='replacement' ORDER BY block_number", [chain, id])).rows.map(r => Number(r.block_number));
    const versions = [];
    let active = null;
    for (const sample of samples) {
      const n = Number(sample.block_number), binding = sample.body.binding, previous = active;
      if (binding && previous?.classHash === binding.classHash && previous.decoderId === binding.decoderId && !replacements.includes(n)) continue;
      if (previous) previous.toBlock = n - 1;
      active = null;
      const fromBlock = sample.body.deploymentEvidence && !replacements.includes(n) ? n : n + 1;
      if (binding && fromBlock <= head.number) {
        active = { ...binding, fromBlock, toBlock: head.number };
        versions.push(active);
      }
    }
    const input = (await client.query(`SELECT * FROM chain.nft_discovery_events WHERE chain=$1 AND address=$2
      ORDER BY block_number,transaction_index,event_index LIMIT $3`, [chain, id, maxEvents + 1])).rows;
    if (input.length > maxEvents)
      throw new ApiError("SOURCE_REPLAY_BUDGET", "Source requires chunked backfill; bounded replay did not write partial projections");
    const rows = input.map(row => {
      const blockNumber = Number(row.block_number), version = versions.find(v => blockNumber >= v.fromBlock && blockNumber <= v.toBlock);
      return { chain, blockNumber, blockHash: row.block_hash, transactionHash: row.transaction_hash,
        transactionIndex: row.transaction_index, eventIndex: row.event_index, canonical: true,
        raw: row.raw, classHash: version?.classHash };
    });
    const binding = versions.length ? { ...versions[0], address: id, versions } : null;
    const projection = binding ? replayNftJournal(rows, [binding], { generation: identity.generation }) : null;
    const deploymentCovered = catalog.deployment_block !== null && Number(identity.coverage_start) <= Number(catalog.deployment_block);
    const body = { address: id, chain, generation: identity.generation, checkpoint: head,
      state: projection?.quarantines.length ? "failed" : !projection || !active ? "unsupported" : "syncing",
      coverage: { startBlock: Number(identity.coverage_start), deploymentBlock: catalog.deployment_block === null ? null : Number(catalog.deployment_block),
        deploymentCovered, historicalComplete: false, reconciliation: "not_run", ambiguousUpgradeBlocks: replacements,
        limitation: "Event replay has not passed fixed-block owner/balance/supply reconciliation" },
      projection, settlementEligible: false };
    await client.query(`INSERT INTO chain.nft_source_projections VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(chain,address) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,
      generation=excluded.generation,body=excluded.body`, [chain, id, head.number, head.hash, identity.generation, body]);
    await client.query("DELETE FROM chain.nft_tokens WHERE chain=$1 AND address=$2", [chain, id]);
    const metadataPosition = (projection?.metadataJobs ?? []).reduce((latest, job) => {
      const p = job.updatedAt, key = [p.blockNumber, p.transactionIndex, p.eventIndex];
      return !latest || key.some((n, i) => n !== latest[i] && key.slice(0, i).every((v, j) => v === latest[j]) && n > latest[i]) ? key : latest;
    }, null);
    const metadataRevision = `${active?.classHash ?? "unknown"}:${metadataPosition?.join(":") ?? "initial"}`;
    for (const token of body.state === "syncing" ? projection.tokens : [])
      await client.query("INSERT INTO chain.nft_tokens VALUES($1,$2,$3,$4)", [chain, id, token.tokenId, { ...token, metadataRevision }]);
    for (const holding of body.state === "syncing" ? projection.holdings : [])
      await client.query("INSERT INTO chain.nft_holdings VALUES($1,$2,$3,$4,$5,$6)", [chain, id, holding.tokenId, holding.account, holding.balance, holding]);
    await client.query("UPDATE chain.nft_catalog SET status=$3 WHERE chain=$1 AND address=$2", [chain, id, body.state]);
    return body;
  });
}
