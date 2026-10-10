"use client";
import { MarketPrice } from "./market-price";

import React, { useMemo } from "react";
import { MarketplaceLink as Link } from "@/components/marketplace/marketplace-link";
import type { NormalizedToken } from "@/lib/marketplace/types";
import {
  displayTokenId,
  formatPriceForDisplay,
  tokenIdCaption,
  tokenMediaSources,
  tokenName,
} from "@/lib/marketplace/token-display";
import { TokenMedia } from "@/components/marketplace/token-media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tokenAttributes } from "@/lib/marketplace/token-attributes";

type MarketplaceTokenCardProps = {
  token: NormalizedToken;
  href: string;
  price?: string | null;
  currency?: string | null;
  cardClassName?: string;
  contentClassName?: string;
  linkClassName?: string;
  linkAriaLabel?: string;
  cardContentAriaLabel?: string;
  cardContentRole?: "article";
  showActions?: boolean;
  onBuyNow?: () => void;
  onSelect?: () => void;
  buyNowLabel?: string;
  viewLabel?: string;
  inlineTraits?: React.ReactNode;
  /** Supporting line at the foot of the card body, such as when the asset last sold. */
  note?: React.ReactNode;
  mediaContainerClassName?: string;
  mediaImageClassName?: string;
};

export const MarketplaceTokenCard = React.memo(function MarketplaceTokenCard({
  token,
  href,
  price,
  currency,
  cardClassName,
  contentClassName,
  linkClassName,
  linkAriaLabel,
  cardContentAriaLabel,
  cardContentRole,
  showActions = false,
  onBuyNow,
  onSelect,
  buyNowLabel = "Buy Now",
  viewLabel = "View",
  inlineTraits,
  note,
  mediaContainerClassName,
  mediaImageClassName,
}: MarketplaceTokenCardProps) {
  const mediaSources = useMemo(() => tokenMediaSources(token), [token]);
  const resolvedPrice = price ?? token.best_listing?.price;
  const resolvedCurrency = currency ?? token.best_listing?.currency;
  const attributes = useMemo(() => tokenAttributes(token.metadata), [token.metadata]);
  const name = tokenName(token);
  const idCaption = tokenIdCaption(name, displayTokenId(token));
  const priceAmount = token.amountsInBaseUnits ? resolvedPrice : formatPriceForDisplay(resolvedPrice);
  const interactiveContent = (
    <>
      <div
        className={cn(
          "flex aspect-[4/5] items-center justify-center bg-[color:var(--realm-surface-slate)]",
          mediaContainerClassName,
        )}
      >
        <TokenMedia
          alt={name}
          className={cn("h-full w-full object-cover", mediaImageClassName)}
          sources={mediaSources}
          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
        />
      </div>
      <CardContent
        aria-label={cardContentAriaLabel}
        className={cn("flex flex-1 flex-col gap-1 p-3", contentClassName)}
        role={cardContentRole}
      >
        <p className="truncate text-sm font-medium leading-5" title={name}>{name}</p>
        {idCaption ? <p className="font-mono text-xs text-muted-foreground">{idCaption}</p> : null}
        {inlineTraits}
        {/* Price is the card's second read after the name; an unlisted asset stays quiet. */}
        {priceAmount == null ? (
          <p className="mt-auto pt-1 text-xs leading-5 text-muted-foreground">Not listed</p>
        ) : (
          <p className="mt-auto flex min-h-5 items-center pt-1 text-sm font-semibold leading-5 text-primary tabular-nums">
            <MarketPrice amount={priceAmount} currency={resolvedCurrency} formatted={!token.amountsInBaseUnits} />
          </p>
        )}
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
      <div
        className="pointer-events-none absolute inset-0 flex items-end bg-[color:var(--realm-bg-void)]/88 p-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        data-testid="token-attributes-overlay"
      >
        <div className="realm-panel w-full p-2">
          <div
            className="max-h-44 overflow-y-auto pr-1"
            data-testid="token-attributes-scroll"
          >
            <table
              className="w-full table-fixed border-collapse text-[11px] leading-4"
              data-testid="token-attributes-table"
            >
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="w-1/2 pb-1 text-left font-medium">Trait</th>
                  <th className="w-1/2 pb-1 text-left font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {attributes.length > 0 ? (
                  attributes.map((attribute) => (
                    <tr
                      className="border-b last:border-b-0"
                      key={`${attribute.trait}:${attribute.value}`}
                    >
                      <td className="truncate py-1 pr-2 text-foreground">
                        {attribute.trait}
                      </td>
                      <td className="break-words py-1 text-foreground">
                        {attribute.value}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2 text-xs text-muted-foreground" colSpan={2}>
                      No attributes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <Card
      className={cn(
        "relative flex min-w-0 flex-col gap-0 overflow-hidden py-0 transition-colors duration-150 hover:border-[color:var(--realm-border-strong)]",
        cardClassName,
      )}
    >
      {onSelect ? (
        <button
          type="button"
          className={cn(
            "group relative flex min-w-0 w-full flex-1 flex-col text-left transition-all duration-150 hover:border-[color:var(--realm-border-strong)]",
            linkClassName,
          )}
          onClick={onSelect}
          aria-label={linkAriaLabel}
        >
          {interactiveContent}
        </button>
      ) : (
        <Link
          className={cn(
            "group relative flex min-w-0 flex-1 flex-col transition-all duration-150 hover:border-[color:var(--realm-border-strong)]",
            linkClassName,
          )}
          href={href}
          aria-label={linkAriaLabel}
        >
          {interactiveContent}
        </Link>
      )}

      {showActions ? (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-[color:var(--realm-border-etched)] p-2">
          {onBuyNow ? (
            <Button className="min-h-11 flex-[1_0_auto] px-2 text-xs" onClick={onBuyNow} type="button" size="sm">
              {buyNowLabel}
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            type="button"
            variant={onBuyNow ? "outline" : "default"}
            className="min-h-11 flex-[1_0_auto] px-2 text-xs"
          >
            <Link href={href}>{viewLabel}</Link>
          </Button>
        </div>
      ) : null}
    </Card>
  );
});
