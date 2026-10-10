"use client";
import { ListSkeleton } from "@/components/marketplace/loading-state";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletSession } from "@/lib/marketplace/use-wallet-session";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
type Notice = {
  id: string;
  type: string;
  collection?: string;
  tokenId?: string;
  read: boolean;
  canonical: boolean;
  provenance: { timestamp: number };
};
export function NotificationsView() {
  const session = useWalletSession(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["owned", "notifications", session.account],
    queryFn: () => marketplaceRequest<Notice[]>("/notifications"),
    enabled: session.verified,
    refetchInterval: 15000,
  });
  const [marking, setMarking] = useState<string | null>(null),
    [markError, setMarkError] = useState("");
  async function mark(id: string) {
    if (marking) return;
    setMarking(id);
    setMarkError("");
    try {
      await marketplaceRequest("/notifications/read", {}, { id });
      await client.invalidateQueries({ queryKey: ["owned", "notifications"] });
    } catch (error) {
      setMarkError(
        error instanceof Error
          ? error.message
          : "Unable to update notification.",
      );
    } finally {
      setMarking(null);
    }
  }
  return (
    <main className="market-page mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="market-page-title">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Offers and trades for your verified wallet.
        </p>
      </div>
      {markError && (
        <p role="alert" className="text-sm text-destructive">
          {markError}
        </p>
      )}
      {!session.verified ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            {!session.connectedAddress ? <WalletConnectButton>Connect wallet to view notifications</WalletConnectButton> : <Button disabled={session.busy} onClick={() => void session.login()}>Verify wallet</Button>}

            <p role="status">{session.error}</p>
          </CardContent>
        </Card>
      ) : query.isPending ? (
        <ListSkeleton label="Loading notifications" />
      ) : query.isError ? (
        <p role="alert">Unable to load notifications.</p>
      ) : query.data?.length ? (
        query.data.map((n) => (
          <Card key={n.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p>
                  {n.type.replaceAll("_", " ")}
                  {!n.canonical
                    ? " · corrected after chain reorganization"
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(n.provenance.timestamp * 1000).toLocaleString()}
                </p>
                {n.collection && n.tokenId && (
                  <Link
                    className="text-sm text-primary"
                    href={`/collections/${n.collection}/${n.tokenId}`}
                  >
                    View token
                  </Link>
                )}
              </div>
              {!n.read && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!marking}
                  onClick={() => void mark(n.id)}
                >
                  {marking === n.id ? "Saving…" : "Mark read"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-muted-foreground">You’re all caught up.</p>
      )}
    </main>
  );
}
