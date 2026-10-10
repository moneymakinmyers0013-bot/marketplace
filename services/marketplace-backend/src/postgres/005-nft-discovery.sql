-- Shadow chain-derived discovery; existing marketplace, application and media data is untouched.
CREATE TABLE chain.nft_discovery_identity (
 chain text PRIMARY KEY, chain_id text NOT NULL, coverage_start bigint NOT NULL CHECK(coverage_start>=0),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0)
);
CREATE TABLE chain.nft_discovery_blocks (
 chain text NOT NULL REFERENCES chain.nft_discovery_identity(chain), number bigint NOT NULL CHECK(number>=0),
 hash text NOT NULL, parent_hash text NOT NULL, timestamp bigint NOT NULL, content_digest text NOT NULL,
 PRIMARY KEY(chain,number), UNIQUE(chain,hash), UNIQUE(chain,number,hash)
);
CREATE TABLE chain.nft_discovery_changes (
 chain text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL, address text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('deployment','replacement')), class_hash text NOT NULL,
 position_precision text NOT NULL CHECK(position_precision='block_end'),
 PRIMARY KEY(chain,block_number,address,kind),
 FOREIGN KEY(chain,block_number,block_hash) REFERENCES chain.nft_discovery_blocks(chain,number,hash) ON DELETE CASCADE
);
CREATE INDEX nft_changes_address ON chain.nft_discovery_changes(chain,address,block_number DESC);
CREATE TABLE chain.nft_discovery_events (
 chain text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL,
 transaction_hash text NOT NULL, transaction_index integer NOT NULL CHECK(transaction_index>=0),
 event_index integer NOT NULL CHECK(event_index>=0), address text NOT NULL, raw jsonb NOT NULL,
 PRIMARY KEY(chain,block_hash,transaction_hash,event_index),
 FOREIGN KEY(chain,block_number,block_hash) REFERENCES chain.nft_discovery_blocks(chain,number,hash) ON DELETE CASCADE
);
CREATE INDEX nft_events_source ON chain.nft_discovery_events(chain,address,block_number,transaction_index,event_index);
CREATE TABLE chain.nft_catalog (
 chain text NOT NULL REFERENCES chain.nft_discovery_identity(chain), address text NOT NULL,
 first_seen_block bigint NOT NULL, deployment_block bigint, class_hash text,
 status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('unknown','candidate','syncing','indexed','unsupported','failed')),
 visible boolean NOT NULL DEFAULT false, verified boolean NOT NULL DEFAULT false,
 tradable boolean NOT NULL DEFAULT false CHECK(NOT tradable),
 generation bigint NOT NULL, PRIMARY KEY(chain,address)
);
CREATE TABLE chain.nft_classifications (
 chain text NOT NULL, address text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL,
 body jsonb NOT NULL, PRIMARY KEY(chain,address,block_number),
 FOREIGN KEY(chain,block_number,block_hash) REFERENCES chain.nft_discovery_blocks(chain,number,hash) ON DELETE CASCADE
);
CREATE TABLE chain.nft_discovery_gaps (
 chain text NOT NULL REFERENCES chain.nft_discovery_identity(chain), from_block bigint NOT NULL CHECK(from_block>=0),
 to_block bigint NOT NULL CHECK(to_block>=from_block), reason text NOT NULL, retryable boolean NOT NULL,
 observed_at bigint NOT NULL, PRIMARY KEY(chain,from_block,to_block)
);
CREATE TABLE chain.nft_discovery_probes (
 chain text PRIMARY KEY REFERENCES chain.nft_discovery_identity(chain), body jsonb NOT NULL
);
CREATE TABLE chain.nft_source_projections (
 chain text NOT NULL, address text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL,
 generation bigint NOT NULL, body jsonb NOT NULL, PRIMARY KEY(chain,address),
 FOREIGN KEY(chain,block_number,block_hash) REFERENCES chain.nft_discovery_blocks(chain,number,hash) ON DELETE CASCADE
);
CREATE TABLE chain.nft_tokens (
 chain text NOT NULL, address text NOT NULL, token_id numeric(78,0) NOT NULL CHECK(token_id>=0 AND token_id<power(2::numeric,256)),
 body jsonb NOT NULL, PRIMARY KEY(chain,address,token_id),
 FOREIGN KEY(chain,address) REFERENCES chain.nft_source_projections(chain,address) ON DELETE CASCADE
);
CREATE TABLE chain.nft_holdings (
 chain text NOT NULL, address text NOT NULL, token_id numeric(78,0) NOT NULL, account text NOT NULL,
 balance numeric(78,0) NOT NULL CHECK(balance>0 AND balance<power(2::numeric,256)), body jsonb NOT NULL,
 PRIMARY KEY(chain,address,token_id,account),
 FOREIGN KEY(chain,address,token_id) REFERENCES chain.nft_tokens(chain,address,token_id) ON DELETE CASCADE
);
CREATE INDEX nft_holdings_account ON chain.nft_holdings(chain,account,address,token_id);
-- Metadata content is durable cache data; associations are served only for canonical source generations.
CREATE TABLE chain.nft_metadata_cache (
 chain text NOT NULL, address text NOT NULL, token_id numeric(78,0) NOT NULL, generation bigint NOT NULL,
 block_hash text NOT NULL, next_attempt bigint NOT NULL, body jsonb NOT NULL, PRIMARY KEY(chain,address,token_id)
);
-- Operator discovery visibility/identity decisions survive journal rewinds and never authorize settlement.
CREATE TABLE app.nft_discovery_policy (
 chain text NOT NULL, address text NOT NULL, visible boolean NOT NULL DEFAULT false,
 verified boolean NOT NULL DEFAULT false, PRIMARY KEY(chain,address)
);
