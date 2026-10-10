import { MarketPrice } from "@/components/marketplace/market-price";
import { useEffect, useMemo, useState } from "react";
import { MarketplaceLink as Link } from "@/components/marketplace/marketplace-link";
import { Card, CardContent } from "@/components/ui/card";
import { useCollectionTokensQuery } from "@/lib/marketplace/hooks";
import { tokenImage } from "@/lib/marketplace/token-display";
import { TokenMedia } from "@/components/marketplace/token-media";
import { cn } from "@/lib/utils";
import type { CollectionCardData } from "@/features/home/types";

type CollectionCardProps = CollectionCardData & {
  featured?: boolean;
};

const PREVIEW_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export function CollectionCard({
  address,
  name,
  projectId,
  imageUrl,
  floorPrice,
  floorCurrency,
  totalSupply,
  listingCount,
  featured,
}: CollectionCardProps) {
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null);
  const [previewRequested, setPreviewRequested] = useState(false);

  useEffect(() => {
    if (imageUrl || previewRequested || !cardElement) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      setPreviewRequested(true);
      observer.disconnect();
    }, {
      rootMargin: "200px",
    });

    observer.observe(cardElement);

    return () => observer.disconnect();
  }, [cardElement, imageUrl, previewRequested]);

  const previewTokensQuery = useCollectionTokensQuery(
    {
      address,
      project: projectId,
      limit: 12,
      fetchImages: true,
    },
    {
      enabled: !imageUrl && previewRequested,
      staleTime: PREVIEW_QUERY_STALE_TIME_MS,
    },
  );

  const resolvedImageUrl = useMemo(() => {
    if (imageUrl) {
      return imageUrl;
    }

    const tokens = previewTokensQuery.data?.page?.tokens ?? [];
    for (const token of tokens) {
      const image = tokenImage(token);
      if (image) {
        return image;
      }
    }

    return null;
  }, [imageUrl, previewTokensQuery.data?.page?.tokens]);

  return (
    <Link
      href={`/collections/${address}`}
      aria-label={`Open ${name}`}
      onFocus={() => setPreviewRequested(true)}
      onMouseEnter={() => setPreviewRequested(true)}
    >
      <div ref={setCardElement}>
        <Card className="overflow-hidden py-0 transition-all duration-200 hover:border-[color:var(--realm-border-strong)] hover:shadow-[0_0_18px_rgba(231,207,136,0.12)]">
          <div className={cn("bg-muted", featured ? "aspect-[16/9]" : "aspect-square")}>
            {resolvedImageUrl ? (
              <TokenMedia
                alt={`${name} preview`}
                className="h-full w-full object-cover object-center"
                sources={[resolvedImageUrl]}
              />
            ) : (
              <div
                data-testid="collection-card-image-fallback"
                className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(231,207,136,0.18),transparent_12rem),linear-gradient(145deg,#161b20,#070b0d)]"
              >
                <span className="text-xs text-muted-foreground">No image</span>
              </div>
            )}
          </div>
          <CardContent className={cn("space-y-1", featured ? "px-4 py-4" : "px-3 py-3")}>
            <p className={cn("realm-title truncate", featured ? "text-xl" : "text-base")}>{name}</p>
            {floorPrice ? (
              <p className={cn("text-xs", featured ? "text-primary" : "text-muted-foreground")}>Floor <MarketPrice amount={floorPrice} currency={floorCurrency} formatted /></p>
            ) : null}
            {totalSupply ? (
              <p className="text-xs text-muted-foreground">Items {totalSupply}</p>
            ) : null}
            {listingCount ? (
              <p className="text-xs text-muted-foreground">Listed {listingCount}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </Link>
  );
}
