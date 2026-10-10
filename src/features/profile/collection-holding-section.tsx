"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";
import { AssetGridSkeleton } from "@/components/marketplace/loading-state";
import { SectionHeader } from "@/components/marketplace/section-header";
import {
  useCollectionQuery,
  useCollectionTokensQuery,
} from "@/lib/marketplace/hooks";
import { normalizeCollectionTokenId } from "@/lib/marketplace/token-id";
import { tokenId } from "@/lib/marketplace/token-display";
import { cn } from "@/lib/utils";
import { useEntrance } from "@/lib/animation";

type GridDensityMode = "compact" | "standard";

const GRID_CLASSES: Record<GridDensityMode, string> = {
  compact: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5",
  standard: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
};

type CollectionHoldingSectionProps = {
  collectionAddress: string;
  collectionName: string;
  tokenIds: string[];
  density: GridDensityMode;
  projectId?: string;
};

export function CollectionHoldingSection({
  collectionAddress,
  collectionName,
  tokenIds,
  density,
  projectId,
}: CollectionHoldingSectionProps) {
  const batches = useMemo(() => {
    const ids = [
      ...new Set(
        tokenIds
          .map(normalizeCollectionTokenId)
          .filter((id): id is string => id !== null),
      ),
    ];
    return Array.from(
      { length: Math.max(1, Math.ceil(ids.length / 100)) },
      (_, i) => ids.slice(i * 100, (i + 1) * 100),
    );
  }, [tokenIds]);

  const collectionQuery = useCollectionQuery({
    address: collectionAddress,
    fetchImages: false,
    projectId,
  });
  const resolvedCollectionName = resolveCollectionName(
    collectionQuery.data?.metadata,
    collectionName,
  );

  return (
    <section className="space-y-3">
      <SectionHeader
        title={resolvedCollectionName}
        count={tokenIds.length}
        className="border-b border-[color:var(--realm-border-etched)] pb-2"
      />

      {batches.map((ids, i) => (
        <HoldingTokenBatch
          key={i}
          collectionAddress={collectionAddress}
          tokenIds={ids}
          density={density}
          projectId={projectId}
        />
      ))}
    </section>
  );
}

function HoldingTokenBatch({
  collectionAddress,
  tokenIds,
  density,
  projectId,
}: Omit<CollectionHoldingSectionProps, "collectionName">) {
  const tokensQuery = useCollectionTokensQuery(
    {
      address: collectionAddress,
      project: projectId,
      tokenIds,
      limit: tokenIds.length,
      fetchImages: true,
    },
    { enabled: tokenIds.length > 0 },
  );

  const gridRef = useEntrance<HTMLDivElement>({
    selector: "[data-holding-token]",
    staggerDelay: 30,
    translateY: 12,
  });

  const tokens = tokensQuery.data?.page?.tokens ?? [];
  const isLoading = tokensQuery.isLoading;
  const gridClasses = GRID_CLASSES[density];

  return (
    <>
      {isLoading ? (
        <AssetGridSkeleton label="Loading collection holdings" count={Math.min(tokenIds.length, 8)} gridClassName={gridClasses} />
      ) : tokensQuery.isError ? (
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Failed to load tokens for this collection.
          </CardContent>
        </Card>
      ) : tokens.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            No token details are available for this collection yet.
          </CardContent>
        </Card>
      ) : (
        <div ref={gridRef} className={cn("grid gap-3", gridClasses)}>
          {tokens.map((token) => (
            <div key={tokenId(token)} data-holding-token>
              <MarketplaceTokenCard
                token={token}
                href={`/collections/${collectionAddress}/${tokenId(token)}`}
                linkAriaLabel={`View token ${tokenId(token)}`}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function resolveCollectionName(
  metadata: unknown,
  fallbackName: string,
): string {
  if (metadata && typeof metadata === "object") {
    const name = (metadata as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name;
    }
  }
  return fallbackName;
}
