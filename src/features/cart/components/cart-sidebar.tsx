"use client";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { TokenMedia } from "@/components/marketplace/token-media";
import { TokenSymbol } from "@/components/ui/token-symbol";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CART_MAX_ITEMS, useCartStore } from "../store/cart-store";
import { useTrade } from "@/lib/marketplace/use-trade";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { prepareCheckout, TradePreparationError } from "@biblio/marketplace";

export function CartSidebar() {
  const {
    items,
    isOpen,
    setOpen,
    removeItem,
    clearCart,
    inlineErrors,
    setItemError,
    clearInlineErrors,
    lastActionError,
  } = useCartStore();
  const trade = useTrade();
  const total = items.reduce((sum, item) => sum + BigInt(item.price), 0n);
  const currency = items[0]?.currency;
  async function checkout() {
    clearInlineErrors();
    const accepted = await trade.execute(async (marketplace) => {
      try {
        return (
          await prepareCheckout(
            marketplaceRequest,
            {
              marketplace,
              chain: trade.config!.chain,
              account: trade.address!,
            },
            items,
          )
        ).calls;
      } catch (error) {
        if (error instanceof TradePreparationError)
          for (const row of error.rows)
            if (!row.valid)
              setItemError(row.key, row.message ?? "Listing unavailable.");
        throw error;
      }
    });
    if (accepted) clearCart();
  }
  return (
    <>
      <Button
        aria-label={`Cart (${items.length})`}
        className="min-h-11 min-w-11"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ShoppingCart className="size-4" />
        <span>{items.length}</span>
      </Button>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          {/* pr-12 keeps the title row and description clear of the sheet's close button. */}
          <SheetHeader className="gap-1 pr-12">
            <div className="flex items-center gap-2">
              <SheetTitle className="market-section-title">Cart</SheetTitle>
              <span className="market-chip inline-flex h-5 items-center rounded-sm border px-1.5 text-muted-foreground">
                {items.length} of {CART_MAX_ITEMS}
              </span>
            </div>
            <SheetDescription>
              One currency per checkout, up to {CART_MAX_ITEMS} items. Everything settles in a single transaction.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ShoppingCart aria-hidden className="size-6 text-muted-foreground" />
                <p className="text-muted-foreground">Your cart is empty.</p>
                <p className="text-xs text-muted-foreground">
                  Add listings from a collection, or sweep the floor.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--realm-border-etched)] border-y border-[color:var(--realm-border-etched)]">
              {items.map((item) => (
                <li key={item.orderId} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="size-12 shrink-0 overflow-hidden rounded-md border border-[color:var(--realm-border-etched)] bg-muted">
                      <TokenMedia
                        alt=""
                        fallbackLabel=""
                        sources={item.tokenImage ? [item.tokenImage] : []}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/collections/${item.collection}/${item.tokenId}`}
                        onClick={() => setOpen(false)}
                        className="block truncate text-sm font-medium leading-5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.tokenName ?? `Token #${item.tokenId}`}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                        {formatCurrencyAmount(item.price, item.currency)}{" "}
                        <TokenSymbol address={item.currency} />
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label={`Remove ${item.tokenName ?? item.tokenId}`}
                      disabled={trade.busy}
                      onClick={() => removeItem(item.orderId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {inlineErrors[item.orderId] && (
                    <p role="alert" className="mt-2 pl-15 text-xs text-destructive">
                      {inlineErrors[item.orderId]}
                    </p>
                  )}
                </li>
              ))}
              </ul>
            )}
            {lastActionError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {lastActionError}
              </p>
            )}
          </div>
          <div className="space-y-3 border-t border-[color:var(--realm-border-etched)] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Total payment</span>
              <span className="flex items-center gap-1.5 text-xl font-semibold tabular-nums text-primary">
                {formatCurrencyAmount(total, currency) ?? "0"}{" "}
                {currency ? <TokenSymbol address={currency} className="text-sm text-muted-foreground" /> : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Includes marketplace fees and royalties. Network fees are
              separate.
            </p>
            {!trade.address ? (
              <WalletConnectButton className="min-h-11 w-full" disabled={!items.length}>
                Connect wallet to checkout
              </WalletConnectButton>
            ) : (
              <Button
                className="min-h-11 w-full"
                disabled={
                  !items.length ||
                  trade.busy ||
                  !trade.address ||
                  !!trade.config?.demo
                }
                onClick={() => void checkout()}
              >
                {trade.busy
                  ? "Processing…"
                  : !trade.address
                    ? "Connect wallet to checkout"
                    : trade.config?.demo
                      ? "Demo — trading disabled"
                      : "Checkout"}
              </Button>
            )}
            {items.length > 0 && !trade.busy ? (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={clearCart}>
                Clear cart
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
