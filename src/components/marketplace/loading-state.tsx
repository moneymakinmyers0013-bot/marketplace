import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetGrid } from "./asset-grid";
import { cn } from "@/lib/utils";

/** One announcement per loading region; decorative bars never become tab stops. */
export function LoadingRegion({
  label,
  children,
  className,
  ...props
}: ComponentProps<"div"> & { label: string; children: ReactNode }) {
  return (
    <div className={className} {...props}>
      <span role="status" aria-label={label} className="sr-only">
        {label}
      </span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function AssetCardSkeleton({
  mediaClassName = "aspect-[4/5]",
  mediaTestId,
}: {
  mediaClassName?: string;
  mediaTestId?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-card">
      <Skeleton
        className={cn("w-full rounded-none", mediaClassName)}
        data-testid={mediaTestId}
      />
      <div className="space-y-3 p-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}

export function AssetGridSkeleton({
  label = "Loading assets",
  count = 6,
  density = "compact",
  mediaClassName,
  gridClassName,
  mediaTestId,
}: {
  label?: string;
  count?: number;
  density?: "compact" | "dense";
  mediaClassName?: string;
  gridClassName?: string;
  mediaTestId?: string;
}) {
  const cards = Array.from(
    { length: Math.max(1, Math.min(count, 12)) },
    (_, i) => (
      <AssetCardSkeleton
        key={i}
        mediaClassName={mediaClassName}
        mediaTestId={mediaTestId}
      />
    ),
  );
  return (
    <LoadingRegion label={label}>
      {gridClassName ? (
        <div className={cn("grid gap-3", gridClassName)}>{cards}</div>
      ) : (
        <AssetGrid density={density}>{cards}</AssetGrid>
      )}
    </LoadingRegion>
  );
}

export function ListSkeleton({
  label = "Loading items",
  count = 3,
  compact = false,
}: {
  label?: string;
  count?: number;
  compact?: boolean;
}) {
  return (
    <LoadingRegion label={label}>
      <div className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4",
              !compact && "min-h-28",
            )}
          >
            <Skeleton className="size-11 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-64" />
              <Skeleton className="h-3 w-1/3 max-w-40" />
            </div>
            <Skeleton className="h-8 w-16 shrink-0 sm:w-24" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function TokenDetailSkeleton() {
  // Mirrors the token page: title block, then artwork beside one tile row and one action row.
  return (
    <LoadingRegion label="Loading token">
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-2/3 max-w-md sm:h-10" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className={i === 0 ? "col-span-2 h-[4.75rem] sm:col-span-1" : "h-[4.75rem]"} />
              ))}
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div className="market-page space-y-6">
      <LoadingRegion label={label}>
        <div className="space-y-3">
          <Skeleton className="h-10 w-56 max-w-full" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
      </LoadingRegion>
      <AssetGridSkeleton label="Loading items" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="market-page space-y-8">
      <LoadingRegion label="Loading marketplace">
        <Skeleton className="h-56 w-full rounded-lg sm:h-72 lg:h-80" />
      </LoadingRegion>
      {/* Mirrors the Collections section: header row, then the table, 12px apart. */}
      <div className="space-y-3">
        <div aria-hidden="true" className="flex min-h-10 items-center">
          <Skeleton className="h-6 w-40" />
        </div>
        <ListSkeleton label="Loading collections" count={4} compact />
      </div>
    </div>
  );
}
export function CollectionPageSkeleton() {
  return (
    // Mirrors the collection route: banner, 32px, then the tab row and grid 16px apart.
    <div className="w-full space-y-4">
      <LoadingRegion label="Loading collection">
        <Skeleton className="h-32 w-full rounded-none sm:h-40" />
        <div className="flex gap-3 pt-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-20" />
          ))}
        </div>
      </LoadingRegion>
      <AssetGridSkeleton label="Loading tokens" />
    </div>
  );
}
