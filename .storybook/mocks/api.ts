import { fn } from "storybook/test";
import { CURRENCY, fixtureConfig, useScenario } from "../scenario";
export const DEFAULT_CURRENCY = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const DAY = 86400;
const NOW = 1_760_000_000;
const ETH = 10n ** 18n;
const order = (
  nonce: number,
  kind: "listing" | "token_offer" | "collection_offer",
  tokenId: string | null,
  price: bigint,
  maker = "0x3",
) => ({
  id: `LOCAL:0x900:${maker}:${nonce}`,
  maker,
  nonce: String(nonce),
  kind,
  state: "open" as const,
  collection: "0xa",
  tokenId,
  currency: CURRENCY,
  buyerDebit: price.toString(),
  expiry: String(NOW + 5 * DAY),
  royaltyAmount: "0",
  royaltyCap: "0",
  feeBps: 200,
  royaltyRecipient: "0x0",
  availability: "funding_unchecked",
});
export const fixtureCollection = {
  address: "0xa",
  name: "Realms",
  description: "Illustrative Storybook collection.",
  image: "/banners/realms.png",
  verified: true,
  tokenCount: "8000",
  listingCount: "412",
  floorByCurrency: [{ currency: CURRENCY, symbol: "STRK", price: (18n * ETH).toString() }],
};
export const fixtureStats = {
  venue: "biblio",
  days: 7,
  periodStart: NOW - 7 * DAY,
  periodEnd: NOW,
  byCurrency: [
    {
      currency: CURRENCY,
      volume: (523n * ETH).toString(),
      sales: 24,
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: NOW - 7 * DAY + i * 7 * 3600,
        price: ((16n + BigInt((i * 7) % 9)) * ETH + BigInt(i) * 10n ** 17n).toString(),
        tokenId: String(100 + i),
      })),
    },
  ],
  floors: [{ currency: CURRENCY, symbol: "STRK", price: (18n * ETH).toString() }],
  floorHistory: Array.from({ length: 9 }, (_, i) => ({
    collection: "0xa",
    currency: CURRENCY,
    price: i === 4 ? null : ((15n + BigInt(i % 4)) * ETH).toString(),
    timestamp: NOW - 7 * DAY + i * 21 * 3600,
    block: 100 + i,
  })),
  historyLimit: 200,
};
export const fixtureListings = Array.from({ length: 12 }, (_, i) =>
  order(10 + i, "listing", String(1 + i), (18n + BigInt(Math.floor(i / 2)) * 2n) * ETH, "0x1"),
);
export const fixtureOffers = [
  order(30, "collection_offer", null, 15n * ETH, "0x5"),
  order(31, "token_offer", "7", 14n * ETH, "0x6"),
  order(32, "token_offer", "2", 9n * ETH + 5n * 10n ** 17n, "0x7"),
];
export const fixtureActivity = [
  {
    id: "0x9:0x1:0",
    type: "order_filled",
    collection: "0xa",
    tokenId: "7",
    currency: CURRENCY,
    buyerDebit: (21n * ETH).toString(),
    sellerProceeds: (20n * ETH).toString(),
    buyer: "0x2",
    seller: "0x1",
    maker: "0x1",
    provenance: { blockNumber: 109, transactionHash: "0xabc", timestamp: NOW - 3600 },
  },
  {
    id: "0x8:0x1:0",
    type: "order_created",
    kind: "listing",
    collection: "0xa",
    tokenId: "3",
    currency: CURRENCY,
    buyerDebit: (19n * ETH).toString(),
    maker: "0x1",
    expiry: String(NOW + DAY),
    provenance: { blockNumber: 108, transactionHash: "0xabd", timestamp: NOW - 5 * 3600 },
  },
  {
    id: "0x7:0x1:0",
    type: "order_created",
    kind: "collection_offer",
    collection: "0xa",
    tokenId: null,
    currency: CURRENCY,
    buyerDebit: (15n * ETH).toString(),
    maker: "0x5",
    expiry: String(NOW + 5 * DAY),
    provenance: { blockNumber: 107, transactionHash: "0xabe", timestamp: NOW - DAY },
  },
  {
    id: "0x6:0x1:0",
    type: "transfer",
    collection: "0xa",
    tokenId: "11",
    from: "0x0",
    to: "0x9",
    provenance: { blockNumber: 106, transactionHash: "0xabf", timestamp: NOW - 2 * DAY },
  },
];
const fixtureTokens = Array.from({ length: 8 }, (_, i) => ({
  id: `0xa:${i + 1}`,
  collection: "0xa",
  tokenId: String(i + 1),
  owner: "0x1",
  metadata: { name: `Realm #${i + 1}`, image: "/banners/realms.png" },
  attributes: [
    { name: "Resource", value: ["Wood", "Stone", "Gold", "Dragonhide"][i % 4] },
    { name: "Resource", value: ["Coal", "Ruby", "Mithral", "Silver"][(i + 1) % 4] },
    { name: "Cities", value: 4 + i },
  ],
  image: "/banners/realms.png",
  bestListing: i < 6 ? fixtureListings[i] : undefined,
}));
function scoped<T>(ready: T, empty: T): Promise<T> | T {
  const state = useScenario.getState().apiState;
  if (state === "pending") return new Promise<never>(() => {});
  if (state === "error") throw new Error("Market data unavailable. Try again shortly.");
  return state === "empty" ? empty : ready;
}
export const marketplaceRequest = fn(
  async (path: string, _query?: unknown, body?: unknown) => {
    if (path === "/marketplace/config")
      return { ...fixtureConfig, demo: useScenario.getState().demo };
    if (path === "/auth/session") return { account: null };
    if (path === "/collections") return scoped([fixtureCollection], []);
    if (path === "/collections/0xa") return scoped(fixtureCollection, { ...fixtureCollection, listingCount: "0", floorByCurrency: [] });
    if (path === "/collections/0xa/listings")
      return scoped({ items: fixtureListings, nextCursor: null }, { items: [], nextCursor: null });
    if (path === "/collections/0xa/offers") {
      const query = (_query ?? {}) as { limit?: number; tokenMatch?: string };
      const items = query.tokenMatch
        ? fixtureOffers.filter((o) => o.tokenId === null || o.tokenId === query.tokenMatch)
        : fixtureOffers;
      return scoped({ items: query.limit === 1 ? items.slice(0, 1) : items, nextCursor: null }, { items: [], nextCursor: null });
    }
    if (path === "/collections/0xa/activity") {
      const query = (_query ?? {}) as { type?: string };
      const items = query.type ? fixtureActivity.filter((a) => a.type === query.type) : fixtureActivity;
      return scoped({ items, nextCursor: null }, { items: [], nextCursor: null });
    }
    if (path === "/collections/0xa/tokens")
      return scoped({ items: fixtureTokens, nextCursor: null }, { items: [], nextCursor: null });
    if (path === "/collections/0xa/stats") {
      const query = (_query ?? {}) as { days?: number };
      return scoped(
        { ...fixtureStats, days: query.days ?? 7 },
        { ...fixtureStats, days: query.days ?? 7, byCurrency: [], floors: [], floorHistory: [] },
      );
    }
    if (path.endsWith("/best-bid")) {
      const scenario = useScenario.getState();
      if (scenario.apiState === "pending") return new Promise(() => {});
      if (scenario.apiState === "error")
        throw new Error("Offer funding is unavailable. Try again.");
      return {
        best:
          scenario.apiState === "empty"
            ? null
            : {
                order: {
                  id: "LOCAL:0x900:0x3:1",
                  maker: "0x3",
                  nonce: "1",
                  kind: "collection_offer",
                  state: "open",
                  collection: "0xa",
                  tokenId: null,
                  currency: CURRENCY,
                  buyerDebit: "2000000000000000000",
                  expiry: "4000000000",
                  royaltyAmount: "0",
                  royaltyCap: "200000000000000000",
                  feeBps: 200,
                  royaltyRecipient: "0x4",
                },
                sellerProceeds: "1860000000000000000",
                checkedBlock: 100,
              },
        checked: 3,
        complete: scenario.bidComplete,
        label: scenario.bidComplete
          ? "Best executable offer"
          : "Best checked offer",
      };
    }
    if (path !== "/checkout/preflight")
      throw new Error(
        `No Storybook fixture for ${path}. Add one explicitly; live requests are disabled.`,
      );
    const input = body as {
      action?: string;
      items: Array<{
        maker: string;
        nonce: string;
        tokenId?: string;
        buyerDebit?: string;
      }>;
    };
    const valid = useScenario.getState().preflight === "valid";
    return {
      canSubmit: valid,
      reasons: [],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      currency: CURRENCY,
      approvalAmount: "0",
      total: input.items
        .reduce(
          (sum, item) => sum + BigInt(item.buyerDebit ?? "2000000000000000000"),
          0n,
        )
        .toString(),
      rows: input.items.map((item) => ({
        key: `LOCAL:0x900:${item.maker}:${item.nonce}`,
        valid,
        message: valid ? undefined : "This listing is no longer available.",
        sellerProceeds: "1860000000000000000",
        protocolFee: "40000000000000000",
        royaltyAmount: "100000000000000000",
        needsNftApproval: true,
      })),
    };
  },
);

export { tokenFromApi } from "../../src/lib/marketplace/api-client";

// Portfolio fixtures obey the production API's maximum 100 IDs per request.
export const fetchCollectionTokens = fn(
  async (options: { tokenIds?: string[]; address: string }) => {
    if (useScenario.getState().apiState === "error")
      throw new Error("Token details unavailable");
    if (useScenario.getState().apiState === "pending")
      return new Promise<never>(() => {});
    const ids = options.tokenIds ?? [];
    if (ids.length > 100) throw new Error("Invalid token IDs");
    return {
      page: {
        tokens:
          useScenario.getState().apiState === "empty"
            ? []
            : ids.map((id) => ({
                contract_address: options.address,
                token_id: id,
                metadata: { name: `Realm ${id}` },
                image: "/banners/realms.png",
              })),
        nextCursor: null,
      },
      error: null,
    };
  },
);
export const ownedClient = {
  getCollection: async () => ({ metadata: { name: "Realms" } }),
};
