"use client";
import { AssetGridSkeleton } from "@/components/marketplace/loading-state";

import { useDeferredValue, useMemo, useState } from "react";
import { WalletIdentity } from "./wallet-identity";
import { useAccount } from "@starknet-react/core";
import { Input } from "@/components/ui/input";
import { useEntrance } from "@/lib/animation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeMarketplaceAddress } from "@/lib/marketplace/address";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { useWalletPortfolioQuery } from "@/lib/marketplace/hooks";
import { formatNumberish } from "@/lib/marketplace/token-display";
import { CollectionHoldingSection } from "./collection-holding-section";

type WalletProfileViewProps = {
  address: string;
  title?: string;
  addressLabel?: string;
  showHeader?: boolean;
};

type PortfolioItem = {
  collectionAddress: string;
  tokenId: string;
  balance: string;
};

type CollectionGroup = {
  collectionAddress: string;
  collectionName: string;
  projectId?: string;
  tokenIds: string[];
};

type GridDensityMode = "compact" | "standard";
const DENSITY_OPTIONS: ReadonlyArray<readonly [GridDensityMode, string]> = [
  ["standard", "Standard"],
  ["compact", "Compact"],
];
const ALL_COLLECTIONS_VALUE = "__all_collections__";

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

type ConfiguredCollectionDetails = {
  name: string;
  projectId?: string;
};

function parsePortfolioItems(data: unknown): PortfolioItem[] {
  const page = asRecord(asRecord(data)?.page);
  const balances = Array.isArray(page?.balances)
    ? (page.balances as unknown[])
    : [];

  const items: PortfolioItem[] = [];
  for (const entry of balances) {
    const record = asRecord(entry);
    if (!record) continue;

    const collectionAddress =
      (typeof record.contract_address === "string" && record.contract_address) ||
      (typeof record.contractAddress === "string" && record.contractAddress) ||
      null;
    const tokenId = formatNumberish(record.token_id ?? record.tokenId);
    const balance = formatNumberish(record.balance) ?? "0";
    if (!collectionAddress || !tokenId) continue;

    try {
      if (BigInt(balance) <= BigInt(0)) {
        continue;
      }
    } catch {
      continue;
    }

    items.push({
      collectionAddress,
      tokenId,
      balance,
    });
  }

  return items;
}

function groupByCollection(
  items: PortfolioItem[],
  configuredCollectionsByAddress: ReadonlyMap<string, ConfiguredCollectionDetails>,
): CollectionGroup[] {
  const map = new Map<string, CollectionGroup>();
  for (const item of items) {
    const normalizedAddress = normalizeMarketplaceAddress(item.collectionAddress);
    const existing = map.get(normalizedAddress);

    if (existing) {
      existing.tokenIds.push(item.tokenId);
      continue;
    }

    const configuredCollection = configuredCollectionsByAddress.get(normalizedAddress);
    map.set(normalizedAddress, {
      collectionAddress: item.collectionAddress,
      collectionName: configuredCollection?.name ?? item.collectionAddress,
      projectId: configuredCollection?.projectId,
      tokenIds: [item.tokenId],
    });
  }

  // Sort collections by item count descending
  return Array.from(map.values()).sort((a, b) => b.tokenIds.length - a.tokenIds.length);
}

export function WalletProfileView({
  address,
  title = "Wallet Profile",
  addressLabel,
  showHeader = true,
}: WalletProfileViewProps) {
  const portfolioQuery = useWalletPortfolioQuery(address);
  const [filterInput, setFilterInput] = useState("");
  const [selectedCollection, setSelectedCollection] = useState(ALL_COLLECTIONS_VALUE);
  const [density, setDensity] = useState<GridDensityMode>("standard");
  const { address: connectedAddress } = useAccount();

  const holdingsRef = useEntrance<HTMLDivElement>({
    selector: '[data-holding-section]',
    staggerDelay: 60,
    translateY: 16,
  });

  const isLoading =
    portfolioQuery.status === "pending" || portfolioQuery.isFetching;
  const isError = portfolioQuery.status === "error" || !!portfolioQuery.error;

  const items = useMemo(
    () => parsePortfolioItems(portfolioQuery.data),
    [portfolioQuery.data],
  );
  const configuredCollectionsByAddress = useMemo(() => {
    const configuredCollections = getMarketplaceRuntimeConfig().collections ?? [];
    const labels = new Map<string, ConfiguredCollectionDetails>();

    for (const collection of configuredCollections) {
      labels.set(normalizeMarketplaceAddress(collection.address), {
        name: collection.name,
        projectId: collection.projectId,
      });
    }

    return labels;
  }, []);
  const collections = useMemo(
    () => groupByCollection(items, configuredCollectionsByAddress),
    [configuredCollectionsByAddress, items],
  );
  const collectionOptions = useMemo(
    () =>
      collections.map(({ collectionAddress, collectionName, projectId, tokenIds }) => ({
        value: collectionAddress,
        label: collectionName,
        projectId,
        count: tokenIds.length,
      })),
    [collections],
  );

  const deferredFilter = useDeferredValue(filterInput);

  const filteredCollections = useMemo(() => {
    const normalized = deferredFilter.trim().toLowerCase();

    return collections
      .filter(
        ({ collectionAddress }) =>
          selectedCollection === ALL_COLLECTIONS_VALUE ||
          normalizeMarketplaceAddress(collectionAddress) ===
            normalizeMarketplaceAddress(selectedCollection),
      )
      .map(({ collectionAddress, collectionName, projectId, tokenIds }) => ({
        collectionAddress,
        collectionName,
        projectId,
        tokenIds:
          normalized.length === 0 ||
          collectionName.toLowerCase().includes(normalized)
            ? tokenIds
            : tokenIds.filter((id) => id.toLowerCase().includes(normalized)),
      }))
      .filter(({ tokenIds }) => tokenIds.length > 0);
  }, [
    collections,
    deferredFilter,
    selectedCollection,
  ]);

  const totalItems = items.length;
  const totalCollections = collections.length;

  return (
    <div
      className="flex w-full flex-col gap-6"
      data-testid="wallet-profile-view"
    >
      {showHeader ? (
        <div className="space-y-1">
          <h1 className="market-page-title">{title}</h1>
          <WalletIdentity address={address} label={addressLabel} connected={!!connectedAddress && connectedAddress.replace(/^0x0*/, "").toLowerCase()===address.replace(/^0x0*/, "").toLowerCase()} />
        </div>
      ) : null}

      {isLoading ? (
        <div data-testid="profile-loading"><AssetGridSkeleton label="Loading holdings" count={8} gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Unable to load wallet items right now.
        </p>
      ) : totalItems === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items found for this wallet.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {totalItems} item{totalItems !== 1 ? "s" : ""} across{" "}
              {totalCollections} collection{totalCollections !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Filter collection or token"
                className="h-10 w-full text-sm sm:w-64"
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder="Filter by collection or token ID…"
                value={filterInput}
              />
              <Select
                onValueChange={setSelectedCollection}
                value={selectedCollection}
              >
                <SelectTrigger
                  aria-label="Filter by collection"
                  className="min-w-44 text-sm data-[size=sm]:h-10"
                  size="sm"
                >
                  <SelectValue placeholder="All collections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COLLECTIONS_VALUE}>
                    All collections
                  </SelectItem>
                  {collectionOptions.map((collection) => (
                    <SelectItem key={collection.value} value={collection.value}>
                      {collection.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Shared segmented look (`.market-segmented`); buttons keep aria-pressed. */}
              <div
                role="group"
                aria-label="Grid density"
                className="market-segmented"
              >
                {DENSITY_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={density === value}
                    className="market-segment h-9 min-w-11 px-3"
                    onClick={() => setDensity(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredCollections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items match the current filter.
            </p>
          ) : (
            <div ref={holdingsRef} className="space-y-8">
              {filteredCollections.map(({ collectionAddress, collectionName, projectId, tokenIds }) => (
                <div key={collectionAddress} data-holding-section>
                  <CollectionHoldingSection
                    collectionAddress={collectionAddress}
                    collectionName={collectionName}
                    density={density}
                    projectId={projectId}
                    tokenIds={tokenIds}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
