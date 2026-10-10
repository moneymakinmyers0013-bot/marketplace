import type { ReactNode } from "react";
import { MarketPrice } from "@/components/marketplace/market-price";
import { Button } from "@/components/ui/button";

/**
 * Buy box for a token's cheapest listing. Further trading actions passed as
 * children share the button row, so every action keeps one size and width.
 */
export function ListingPurchase({
  price,
  currency,
  inCart = false,
  isOwner = false,
  showPrice = true,
  onAdd,
  onViewCart,
  children,
}: {
  price?: string;
  currency?: string;
  inCart?: boolean;
  isOwner?: boolean;
  /** Hide the price when a summary beside the buy box already shows it. */
  showPrice?: boolean;
  onAdd: () => void;
  onViewCart?: () => void;
  children?: ReactNode;
}) {
  const hasActions = !!price || !!children;
  return (
    <div className="space-y-3">
      {showPrice ? (
        <div className="space-y-1">
          <p className="market-label">{price ? "Price" : "Listing status"}</p>
          <p className="text-2xl">
            <MarketPrice amount={price} currency={currency} />
          </p>
        </div>
      ) : null}
      {hasActions ? (
        <div className="grid gap-2 sm:auto-cols-fr sm:grid-flow-col">
          {price ? (
            <Button
              className="min-h-11 w-full"
              disabled={isOwner}
              onClick={inCart ? onViewCart : onAdd}
            >
              {isOwner
                ? "You own this item"
                : inCart
                  ? "View cart"
                  : "Add to cart"}
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
      {price ? (
        <p className="text-xs text-muted-foreground">
          Includes marketplace fees and royalties. Network fees are separate.
        </p>
      ) : null}
      {price && inCart ? (
        <p role="status" className="text-sm">
          Added to your cart
        </p>
      ) : null}
    </div>
  );
}
