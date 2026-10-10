"use client";

import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { AssetCardSkeleton } from "@/components/marketplace/loading-state";
import { SectionHeader } from "@/components/marketplace/section-header";
import type { TrendingToken } from "@/features/home/types";
import { useEntrance } from "@/lib/animation";

/** Every card in the rail shares one width so names, prices and notes line up. */
const CARD_WIDTH = "w-44 shrink-0 sm:w-48";

type TrendingTokensSectionProps = {
  tokens: TrendingToken[];
  isLoading?: boolean;
  title?: string;
  emptyMessage?: string;
};

export function TrendingTokensSection({
  tokens,
  isLoading = false,
  title = "Trending Tokens",
  emptyMessage = "No trending tokens",
}: TrendingTokensSectionProps) {
  const scrollRef = useEntrance<HTMLDivElement>({
    selector: "[data-trending-item]",
    staggerDelay: 60,
    translateX: -12,
    translateY: 0,
  });

  return (
    <section data-testid="trending-tokens" className="space-y-3">
      <SectionHeader title={title} />

      {isLoading ? (
        <div role="status" aria-label="Loading recent sales" data-testid="trending-tokens-scroll" className="overflow-x-auto">
          <div className="flex gap-3 pb-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={CARD_WIDTH}>
                <AssetCardSkeleton mediaTestId="trending-token-skeleton" />
              </div>
            ))}
          </div>
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
          <div data-testid="trending-tokens-scroll" className="overflow-x-auto">
            <div ref={scrollRef} className="flex gap-3 pb-2">
              {tokens.map((entry, index) => (
                <div key={`${entry.href}-${index}`} className={CARD_WIDTH} data-trending-item>
                  <MarketplaceTokenCard
                    token={entry.token}
                    href={entry.href}
                    price={entry.price}
                    currency={entry.currency}
                    note={entry.note}
                    cardClassName="h-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
