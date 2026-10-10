# Bounded NFT discovery and catalog

This is a local, reviewable implementation slice of
[epic #108](https://github.com/BibliothecaDAO/marketplace/issues/108).
It does not complete that epic or authorize deployment. On 10 October 2026 the
user instructed: “Continue local work; hold staging.”

## Implemented behavior

Migration 005 adds a chain-specific canonical discovery journal, class history,
classification evidence, source-local projections, exact numeric token IDs and
holdings, durable textual metadata cache and separate application visibility
policy. No discovery operation writes settlement policy or enables trading.

The scanner checks chain identity and RPC specification, obtains complete
receipts and state updates, discovers deployments/replacements and receipt
emitters, and verifies a fixed range anchor before and after acquisition. One
receipt read supplies all discovered sources. Restart resumes the committed
checkpoint; identical blocks are idempotent, while different content at the same
hash is rejected. Acquisition errors create explicit retryable/nonretryable gaps.
Reorgs rewind only discovery state, invalidate its generation and source
projections, and preserve application policy and cached metadata.

Classification probes the contract at canonical class-change/checkpoint hashes.
Only exact reviewed field names, field types, key/data partitions and flat event
envelopes select an adapter. ERC-721 Cairo 1, Cairo 0 and ERC-1155 layouts are
supported by explicit adapters. Proxy/custom/unknown layouts retain classification
evidence without inventing decoder compatibility. Matching a reviewed
OpenZeppelin event layout does not establish the deployed class's implementation
lineage or an audit result.

Reference replay applies one source atomically from the shared journal. It
preserves uint256 IDs, quantities, ownership, approvals, burns, batch subrecord
identity and receipt provenance. Unsupported intervals and ambiguous
class-replacement blocks are quarantined. A malformed source withholds its
normalized token/holdings output without rewriting another source or existing
market orders. An unsupported current class also withholds old holdings.
Every output remains `settlementEligible=false`, with historical completeness
false and reconciliation `not_run`.

Textual metadata is separate from ownership indexing. URI calls use the source's
fixed checkpoint hash and hexadecimal uint256 calldata. Existing URI/ByteArray,
inline JSON, IPFS and unsafe-destination protections are reused. Fetches are
bounded to 2 MiB; successful content is hashed, failures are explicit and retried.
Generation or metadata-event/class revision changes invalidate the public cache
association immediately. A completion from an old checkpoint is discarded.
This extension does not fetch or render origin images.

## Local operation

Use Node 22.23.3 and install the existing lockfile with `pnpm install --frozen-lockfile`.
Supply an isolated PostgreSQL `DATABASE_URL` and configurable
`STARKNET_RPC_URL` through the environment. Keep credentials out of committed
files and command arguments. Run migrations with the existing administrative
workflow before using the discovery CLI; existing runtime roles must be
reprovisioned after adding tables.

```sh
pnpm backend:pg migrate
pnpm backend:discovery scan --chain SN_MAIN --start 0 --stop 24 --window 25
pnpm backend:discovery classify --chain SN_MAIN --limit 25
pnpm backend:discovery replay --chain SN_MAIN --source 0x...
pnpm backend:discovery metadata --chain SN_MAIN --limit 10
pnpm backend:discovery report --chain SN_MAIN
```

Each `scan` invocation acquires at most one window. Repeat it with the same
start and a reviewed stop to resume. This is a bounded manual CLI, not a deployed
continuous scheduler. Starting after deployment does not prove full token history.
Use SN_SEPOLIA for a future controlled integration environment; LOCAL is reserved
for isolated fixtures.

| Bound | Current value |
| --- | --- |
| Receipt/state-diff window | 1–100 blocks; default 25 |
| Total decoded RPC acquisition bytes | 64 MiB per invocation |
| Common-ancestor search | Default 100 block reads; configurable maximum 1,000 |
| Classification work | Default 25 candidates; CLI maximum 100 |
| Class-history samples per candidate | 100; larger histories remain unsupported |
| Source reference replay | Default 20,000 events; library maximum 100,000 |
| Metadata batch | Default 10 tokens; maximum 100 |
| Metadata origin response | 2 MiB; ready refresh after 6 hours, failure retry after 5 minutes |
| Public page | Default 20 records; maximum 100 |

A source exceeding its replay budget fails before writing partial projections.
Reduce acquisition windows after byte/provider failures. Reorgs beyond the rewind
budget persist a gap and require operator investigation or a reviewed rebuild;
do not erase application policy or claim the gap is resolved.

## Public interfaces

The existing API wraps GETs in a consistent PostgreSQL read snapshot. Discovery
cursors bind chain, resource/query scope and replay generation; a rewind rejects
old cursors. IDs and holdings are decimal strings with numeric ordering.

| Endpoint under `/v1/chains/:chain` | Result |
| --- | --- |
| `GET /discovery/status` | Identity/checkpoint, state counts, bounded gaps, metadata counts, latest probe and observed lag |
| `GET /discovery/collections?q=...` | Operator-visible, classified collections; address search only |
| `GET /discovery/collections/:address/tokens` | Nonburned tokens, textual metadata status, source checkpoint/coverage |
| `GET /discovery/accounts/:account/holdings?collection=...` | Exact supported holdings from published sources |
| `POST /operator/discovery` | Existing bearer-protected operator policy: address, explicit visible/verified booleans |

The operator endpoint rejects trading flags. Visibility and verification are
durable independent decisions; moderation still suppresses affected collections.
Public discovery is PostgreSQL-only and does not change existing catalog routes,
registered assets, fees, royalties, orders, checkout or curated scanner behavior.
SDK clients expose `client.discovery.status()`, `.collections(query)`,
`.tokens(address, query)` and `.holdings(account, query)`.

The `/discovery` Next.js route uses these SDK methods for collection/token/holdings
browsing, scoped URL pagination, loading/error/partial states and expired-cursor
recovery. It has no wallet signing or trading action. Address search and supported
indexed holdings are distinct from full-chain coverage. See
[Storybook evidence](STORYBOOK.md#browse-only-nft-discovery)
for fixture/browser limitations.

## Verification and measured evidence

[The public evidence record](evidence/nft-discovery-2026-10-10.json) records the
provider, UTC times, Node runtime, canonical hashes and limits:

- Three genesis blocks and 25 recent mainnet blocks acquired full receipts/state
  diffs. The recent range contained 320 events and acquired about 352 kB in 55 RPC
  calls at 1.11 blocks/second. These small unbiased ranges found no supported NFT;
  they validate acquisition, not NFT inventory.
- Realms, Loot Chests, Cosmetics and Golden Token classified as ERC-721 at one
  fixed mainnet block. All matched the strict reviewed Cairo 1 event shape.
- At Golden Token block 2021301, 160 selected mint Transfer receipt events replayed
  into tokens; ten sampled indexed owners matched direct `owner_of` calls at the
  identical block hash. Other source events were excluded from this decoder check.
  It is not complete source reconciliation or ERC-1155 live evidence.
- Deployment-adjacent Realms and Golden Token replay retained unknown setup-event
  exceptions and correctly withheld the affected source output.

Local checks passed: 145 native backend tests, 52 PostgreSQL integration tests,
five focused source-replay tests (including the additional unsupported-current-class
regression), 44 SDK tests, package-install verification, nine UI unit tests,
13 Storybook interaction/accessibility tests, SDK/app/Storybook builds, typecheck,
targeted ESLint, `pnpm release:check` and `git diff --check`.
Browser checks used isolated Chromium and HTTP fixtures: 27 story layouts and nine
Next.js route layouts at 320/768/1440px plus four route interaction flows.
No staging, production-wallet or complete chain indexing was exercised.

Two existing PostgreSQL tests used timing assumptions: metadata overlap failed on
the clean base commit too, and replay statistics crossed wall-clock seconds.
The tests now use an explicit concurrency barrier and fixed clock respectively.
Their isolated and full-suite checks passed.

## Acceptance gates still open

| Issue | Local contribution | Remaining requirement |
| --- | --- | --- |
| #109 catalog/coverage | Database catalog, policy, source checkpoints, generation cursors | Production migration/coverage rehearsal and complete lifecycle semantics |
| #110 discovery | Bounded receipt/state-diff reader, restart, gaps, upgrades, rewind | Full historical mainnet acquisition and continuous provider-backed service |
| #111 classification | Existing classifier plus strict typed adapter binding | Broader historical/proxy/custom capability evidence and exception review |
| #112 decoding/reconciliation | Versioned adapters, pure replay, sampled live owner comparison | Complete fixed-block owner/balance/approval/supply reconciliation strategies |
| #113 independent backfills | Atomic bounded per-source reference replay | Durable chunked resumable jobs, catch-up/promotion coordination beyond event budget |
| #114 shared live acquisition | One discovery receipt window for all emitters | Integration with the deployed curated reader, continuous scheduling and representative capacity |
| #115 metadata/public catalog | SDK/API, metadata revision/retry cache, browse UI | Fair persistent queue/priorities, media/collection enrichment and representative coverage |
| #116 legacy/custom | Explicit Cairo 0 adapter; unsupported data retained | Live legacy corpus, custom exception register and reviewed variants |
| #117 ERC-1155 | Lossless decoder/projection/holdings fixtures and HTTP test | Live ERC-1155 sample plus independent balance/supply checks |
| #118 operations | Small public-RPC metrics and local crash/reorg/role tests | Approved provider quota/costs, full-chain metrics, realistic load/restore/outage drills, targets/alerts, staging comparison and authorized rollout |

All child issues and the parent epic remain open. No production, staging, archive
provider purchase or TaskMarket completion submission is part of this slice.
