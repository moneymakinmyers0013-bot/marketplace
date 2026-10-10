import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { PgCatalog } from "../../src/postgres/catalog.mjs";
import { Store } from "../../src/store.mjs";
import { Catalog } from "../../src/catalog.mjs";
import { applicationStore } from "../../src/application-store.mjs";
import { address, orderKey } from "../../src/domain.mjs";
test("PostgreSQL and SQLite replay the complete order lifecycle with identical accounting, activity, notifications and reorg state", async (t) => {
  const fixedNow = Date.now();
  t.mock.method(Date, "now", () => fixedNow);
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const pg = new PgStore(pool),
    sqlite = new Store(":memory:");
  t.after(() => sqlite.close());
  const collection = address("9"),
    market = address("99"),
    currency = address("8"),
    seller = address("2"),
    buyer = address("3"),
    config = {
      chain: "LOCAL",
      marketplace: market,
      marketplaceStartBlock: 1,
      collections: [{ address: collection, startBlock: 1 }],
      currencies: [{ address: currency, symbol: "TEST" }],
    };
  const now = Math.floor(Date.now() / 1000),
    key = orderKey("LOCAL", market, seller, "1");
  const created = {
    type: "order_created",
    key,
    maker: seller,
    nonce: "1",
    kind: "listing",
    collection,
    tokenId: "1",
    currency,
    buyerDebit: "100",
    expiry: "4000000000",
    royaltyAmount: "5",
    royaltyRecipient: address("5"),
    royaltyCap: "5",
    feeBps: 200,
  };
  const blocks = [
    [
      {
        type: "initialized",
        version: 1,
        admin: address("4"),
        feeBps: 200,
        feeRecipient: address("4"),
        paused: false,
      },
      {
        type: "collection_policy",
        address: collection,
        enabled: true,
        royalties: true,
      },
      { type: "currency_policy", address: currency, enabled: true },
      {
        type: "transfer",
        collection,
        tokenId: "1",
        from: address("0"),
        to: seller,
      },
    ],
    [
      created,
      {
        ...created,
        type: "order_created",
        key: orderKey("LOCAL", market, buyer, "1"),
        maker: buyer,
        kind: "token_offer",
      },
      {
        ...created,
        type: "order_created",
        key: orderKey("LOCAL", market, buyer, "2"),
        maker: buyer,
        nonce: "2",
        kind: "collection_offer",
        tokenId: null,
      },
    ],
    [
      { type: "fee_policy_changed", feeBps: 500, feeRecipient: address("6") },
      { type: "transfer", collection, tokenId: "1", from: seller, to: buyer },
      {
        type: "order_filled",
        key,
        maker: seller,
        nonce: "1",
        buyer,
        seller,
        collection,
        tokenId: "1",
        currency,
        buyerDebit: "100",
        sellerProceeds: "93",
        protocolFee: "2",
        feeRecipient: address("6"),
        royaltyAmount: "5",
        royaltyRecipient: address("5"),
      },
    ],
  ];
  for (const store of [sqlite, pg]) {
    await store.put("collection", collection, {
      address: collection,
      name: "Realms",
    });
    for (const [i, events] of blocks.entries())
      await store.applyBlock({
        number: i + 1,
        hash: "0x" + (i + 1),
        parentHash: "0x" + i,
        timestamp: now + i,
        events: events.map((e, n) => ({
          ...e,
          eventIndex: n,
          transactionHash: "0x" + (i + 10),
        })),
        sources: [collection, market],
        sourceStarts: { [collection]: 1, [market]: 1 },
        observedAt: now * 1000,
      });
  }
  for (const kind of [
    "token",
    "order",
    "config",
    "activity",
    "stats_day",
    "floor_current",
    "floor_history",
    "progress",
  ])
    assert.deepEqual(await pg.list(kind), sqlite.list(kind), kind);
  const actual = new PgCatalog(pg, config),
    expected = new Catalog(sqlite, config);
  assert.deepEqual(
    await actual.stats(collection, { currency }),
    expected.stats(collection, { currency }),
  );
  assert.deepEqual(
    await pg.notifications(seller),
    sqlite.notifications(seller),
  );
  const notice = (await pg.notifications(seller))[0];
  await applicationStore(pg).readNotification(seller, notice.id);
  applicationStore(sqlite).readNotification(seller, notice.id);
  await pg.rewind(2);
  sqlite.rewind(2);
  assert.deepEqual(await pg.list("order"), sqlite.list("order"));
  assert.deepEqual(
    await pg.notifications(seller),
    sqlite.notifications(seller),
  );
  assert.equal(
    (await pg.notifications(seller)).find((n) => n.id === notice.id).read,
    true,
  );
});
