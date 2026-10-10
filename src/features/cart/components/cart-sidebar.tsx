"use client";
import dynamic from "next/dynamic";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CART_MAX_ITEMS, useCartStore } from "../store/cart-store";

const CartBody = dynamic(() => import("./cart-body").then(module => module.CartBody), {
  loading: () => <p role="status" className="px-4 text-sm text-muted-foreground">Loading cart…</p>,
});

export function CartSidebar() {
  const items = useCartStore(state => state.items);
  const isOpen = useCartStore(state => state.isOpen);
  const setOpen = useCartStore(state => state.setOpen);
  return <Sheet open={isOpen} onOpenChange={setOpen}>
    <SheetTrigger asChild>
    <Button aria-label={`Cart (${items.length})`} className="min-h-11 min-w-11" variant="outline" size="sm">
      <ShoppingCart className="size-4" /><span>{items.length}</span>
    </Button>
    </SheetTrigger>
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
        <CartBody />
      </SheetContent>
  </Sheet>;
}
