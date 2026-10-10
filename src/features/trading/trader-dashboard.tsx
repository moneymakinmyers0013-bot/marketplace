"use client";
import { AssetGridSkeleton, ListSkeleton } from "@/components/marketplace/loading-state";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTrade } from "@/lib/marketplace/use-trade";
import { marketplaceRequest, tokenFromApi } from "@/lib/marketplace/api-client";
import type { ApiOrder, ApiPage, ApiToken } from "@/lib/marketplace/types";
import { prepareCancellation } from "@biblio/marketplace";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderComposer } from "./order-composer";
import { AcceptOffer } from "./accept-offer";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
function IncomingOffer({ order }: { order: ApiOrder }) {
  const trade = useTrade();
  const [token, setToken] = useState(""),
    [cursor, setCursor] = useState<string | null>(null);
  const holdings = useQuery({
    queryKey: [
      "owned",
      "offer-inventory",
      trade.address,
      order.collection,
      cursor,
    ],
    queryFn: () =>
      marketplaceRequest<ApiPage<ApiToken>>(
        `/accounts/${trade.address}/holdings`,
        { collection: order.collection, limit: 100, cursor },
      ),
    enabled: !!trade.address && order.kind === "collection_offer",
  });
  const selected = order.tokenId ?? token;
  return (
    <div className="space-y-2">
      {order.kind === "collection_offer" && (
        <>
          <Select value={token} onValueChange={setToken}>
            <SelectTrigger aria-label="NFT to sell">
              <SelectValue placeholder="Choose your NFT" />
            </SelectTrigger>
            <SelectContent>
              {holdings.data?.items.map((t) => (
                <SelectItem value={t.tokenId} key={t.id}>
                  {String(t.metadata.name ?? `Token #${t.tokenId}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {holdings.data?.nextCursor && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCursor(holdings.data!.nextCursor);
                setToken("");
              }}
            >
              More NFTs
            </Button>
          )}
        </>
      )}
      {selected && <AcceptOffer order={order} tokenId={selected} />}
    </div>
  );
}
export function TraderDashboard() {
  const trade = useTrade();
  const [tab, setTab] = useState("inventory"),
    [selected, setSelected] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [reprice, setReprice] = useState(false),
    [orderCursor, setOrderCursor] = useState<string | null>(null),
    [orderState, setOrderState] = useState("all");
  const holdings = useQuery({
    queryKey: ["owned", "trader-holdings", trade.address, cursor],
    queryFn: () =>
      marketplaceRequest<ApiPage<ApiToken>>(
        `/accounts/${trade.address}/holdings`,
        { limit: 100, cursor },
      ),
    enabled: !!trade.address,
  });
  const orders = useQuery({
    queryKey: [
      "owned",
      "trader-orders",
      trade.address,
      tab,
      orderCursor,
      orderState,
    ],
    queryFn: () =>
      marketplaceRequest<ApiPage<ApiOrder>>(
        `/accounts/${trade.address}/orders`,
        {
          direction:
            tab === "received"
              ? "received"
              : tab === "listings"
                ? "listed"
                : "made",
          kind: tab === "made" ? "offer" : undefined,
          state: orderState === "all" ? undefined : orderState,
          cursor: orderCursor,
          limit: 50,
        },
      ),
    enabled: !!trade.address && tab !== "inventory" && tab !== "history",
  });
  const history = useQuery({
    queryKey: ["owned", "account-history", trade.address, orderCursor],
    queryFn: () =>
      marketplaceRequest<
        ApiPage<{
          id: string;
          type: string;
          collection?: string;
          tokenId?: string;
          provenance: { timestamp: number };
        }>
      >(`/accounts/${trade.address}/activity`, {
        cursor: orderCursor,
        limit: 50,
      }),
    enabled: !!trade.address && tab === "history",
  });
  const assets =
    holdings.data?.items.filter((t) => selected.includes(t.id)) ?? [];
  const selectedOrders =
    orders.data?.items.filter(
      (o) => selected.includes(o.id) && o.kind === "listing",
    ) ?? [];
  function toggle(id: string) {
    setSelected((v) =>
      v.includes(id)
        ? v.filter((x) => x !== id)
        : v.length < 25
          ? [...v, id]
          : v,
    );
  }
  async function cancel() {
    await trade.execute(
      (m) => prepareCancellation({marketplace:m,chain:trade.config!.chain,account:trade.address!},selected),
      "cancel",
    );
    setSelected([]);
  }
  return (
    <main className="market-page mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="market-page-title">Trading dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage your inventory, listings and offers.
        </p>
      </div>
      {!trade.address ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            <p className="mb-4">Connect your wallet to manage trading.</p><WalletConnectButton />
          </CardContent>
        </Card>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setSelected([]);
            setReprice(false);
            setOrderCursor(null);
          }}
        >
          <TabsList className="flex h-auto flex-wrap justify-start">
            {[
              ["inventory", "Inventory"],
              ["listings", "My listings"],
              ["made", "Offers made"],
              ["received", "Offers received"],
              ["history", "Activity"],
            ].map(([v, label]) => (
              <TabsTrigger key={v} value={v}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="inventory" className="space-y-4">
            {holdings.isError ? (
              <p role="alert">Unable to load holdings.</p>
            ) : holdings.isPending ? (
              <AssetGridSkeleton label="Loading inventory" gridClassName="grid-cols-2 md:grid-cols-4 xl:grid-cols-5" />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {selected.length}/25 selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </Button>
                </div>
                {assets.length > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <OrderComposer
                        collection={assets[0].collection}
                        assets={assets.map((t) => ({
                          collection: t.collection,
                          tokenId: t.tokenId,
                        }))}
                        kind="listing"
                      />
                    </CardContent>
                  </Card>
                )}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                  {holdings.data?.items.map((t) => (
                    <div key={t.id} className="space-y-2">
                      <MarketplaceTokenCard
                        token={tokenFromApi(t)}
                        href={`/collections/${t.collection}/${t.tokenId}`}
                      />
                      <Button
                        className="w-full"
                        size="sm"
                        variant={
                          selected.includes(t.id) ? "default" : "outline"
                        }
                        aria-pressed={selected.includes(t.id)}
                        onClick={() => toggle(t.id)}
                      >
                        {selected.includes(t.id) ? "Selected" : "Select"}
                      </Button>
                    </div>
                  ))}
                </div>
                {!holdings.data?.items.length && (
                  <p className="text-muted-foreground">
                    No indexed NFTs for this wallet.
                  </p>
                )}
                {holdings.data?.nextCursor && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCursor(holdings.data!.nextCursor);
                      setSelected([]);
                    }}
                  >
                    Next inventory page
                  </Button>
                )}
              </>
            )}
          </TabsContent>
          {["listings", "made", "received"].map((v) => (
            <TabsContent key={v} value={v} className="space-y-4">
              <Select
                value={orderState}
                onValueChange={(v) => {
                  setOrderState(v);
                  setOrderCursor(null);
                  setSelected([]);
                }}
              >
                <SelectTrigger aria-label="Order state" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["all", "open", "expired", "filled", "cancelled"].map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {v !== "received" && selected.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={trade.busy}
                    onClick={() => void cancel()}
                  >
                    Cancel selected
                  </Button>
                  {v === "listings" && (
                    <Button
                      variant="outline"
                      onClick={() => setReprice(!reprice)}
                    >
                      Reprice selected
                    </Button>
                  )}
                </div>
              )}
              {reprice && selectedOrders.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <OrderComposer
                      kind="listing"
                      collection={selectedOrders[0].collection}
                      assets={selectedOrders.map((o) => ({
                        collection: o.collection,
                        tokenId: o.tokenId!,
                      }))}
                      replaceIds={selectedOrders.map((o) => o.id)}
                    />
                  </CardContent>
                </Card>
              )}
              {orders.isPending ? (
                <ListSkeleton label="Loading orders" />
              ) : orders.isError ? (
                <p role="alert">Unable to load orders.</p>
              ) : (
                orders.data?.items
                  .filter((o) =>
                    v === "listings"
                      ? o.kind === "listing"
                      : o.kind !== "listing",
                  )
                  .map((o) => (
                    <Card key={o.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                        <div>
                          <Link
                            className="font-medium hover:text-primary"
                            href={`/collections/${o.collection}${o.tokenId != null ? "/" + o.tokenId : ""}`}
                          >
                            {o.kind === "collection_offer"
                              ? "Collection offer"
                              : `Token #${o.tokenId}`}
                          </Link>
                          <p>
                            {formatCurrencyAmount(o.buyerDebit, o.currency)}{" "}
                            {getTokenSymbol(o.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o.state === "open" &&
                            Number(o.expiry) * 1000 <= Date.now()
                              ? "expired"
                              : (({funding_unchecked:"Funding checked on acceptance",approval_unchecked:"Approval checked at checkout",transferred:"Unavailable — NFT transferred"} as Record<string,string>)[o.availability??""]??o.state)}{" "}
                            · expires{" "}
                            {new Date(Number(o.expiry) * 1000).toLocaleString()}
                          </p>
                        </div>
                        {v === "received" ? (
                          <IncomingOffer order={o} />
                        ) : (
                          o.state === "open" && (
                            <Button
                              variant={
                                selected.includes(o.id) ? "default" : "outline"
                              }
                              size="sm"
                              aria-pressed={selected.includes(o.id)}
                              onClick={() => toggle(o.id)}
                            >
                              {selected.includes(o.id) ? "Selected" : "Select"}
                            </Button>
                          )
                        )}
                      </CardContent>
                    </Card>
                  ))
              )}
              {orders.data?.items.length === 0 && (
                <p className="text-muted-foreground">No orders here yet.</p>
              )}
              {orders.data?.nextCursor && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setOrderCursor(orders.data!.nextCursor);
                    setSelected([]);
                  }}
                >
                  Next orders page
                </Button>
              )}
              {orderCursor && (
                <Button variant="ghost" onClick={() => setOrderCursor(null)}>
                  First page
                </Button>
              )}
            </TabsContent>
          ))}
          <TabsContent value="history" className="space-y-3">
            {history.isPending ? <ListSkeleton label="Loading activity" compact /> : history.isError ? (
              <p role="alert">Unable to load activity.</p>
            ) : (
              history.data?.items.map((event) => (
                <Card key={event.id}>
                  <CardContent className="flex justify-between p-4 text-sm">
                    <span>
                      {event.type.replaceAll("_", " ")}
                      {event.tokenId != null ? ` · NFT #${event.tokenId}` : ""}
                    </span>
                    <span>
                      {new Date(
                        event.provenance.timestamp * 1000,
                      ).toLocaleString()}
                    </span>
                  </CardContent>
                </Card>
              ))
            )}
            {history.data?.items.length === 0 && (
              <p>No indexed activity yet.</p>
            )}
            {history.data?.nextCursor && (
              <Button onClick={() => setOrderCursor(history.data!.nextCursor)}>
                Next activity page
              </Button>
            )}
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}
