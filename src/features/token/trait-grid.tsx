import Link from "next/link";
import {
  ResourceIcon,
  resolveResourceIcon,
} from "@/components/marketplace/resource-icon";
import { activeFiltersToSearchParams } from "@/lib/marketplace/traits";
import type { TraitRarityLookup } from "./use-trait-rarity";

export type TraitAttribute = { name: string; value: string };

export type TraitGridProps = {
  attributes: TraitAttribute[];
  /** Collection-wide frequencies; cards show "x% have this" when known. */
  rarity?: TraitRarityLookup | null;
  collectionAddress: string;
};

const RESOURCE_TRAIT = "resource";

function isResourceTrait(name: string) {
  return name.trim().toLowerCase() === RESOURCE_TRAIT;
}

function normalizeValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Trait rows from token metadata, whichever attribute shape the source used. */
export function traitAttributesFromMetadata(metadata: unknown): TraitAttribute[] {
  if (!metadata || typeof metadata !== "object") return [];
  const attributes = (metadata as { attributes?: unknown }).attributes;
  if (!Array.isArray(attributes)) return [];

  const seen = new Set<string>();
  const rows: TraitAttribute[] = [];
  for (const raw of attributes) {
    if (!raw || typeof raw !== "object") continue;
    const attribute = raw as Record<string, unknown>;
    const name = normalizeValue(
      attribute.trait_type ?? attribute.traitName ?? attribute.name,
    );
    const value = normalizeValue(attribute.value ?? attribute.traitValue);
    if (!name || !value) continue;
    const key = `${name}\u0000${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, value });
  }
  return rows;
}

/** Link to the collection browse view with this single trait selected. */
export function traitFilterHref(collectionAddress: string, name: string, value: string) {
  const params = activeFiltersToSearchParams({ [name]: new Set([value]) });
  return `/collections/${collectionAddress}?${params.toString()}`;
}

export function formatTraitShare(share: number) {
  const percent = share * 100;
  if (percent < 0.1) return "<0.1%";
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function ShareNote({ share }: { share: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      {formatTraitShare(share)} have this
    </span>
  );
}

/** Matches the trait group names in the collection filter sidebar. */
const traitNameClassName =
  "market-chip text-muted-foreground";

const linkClassName =
  "realm-stat-pill flex min-h-11 flex-col justify-center gap-0.5 px-3 py-2.5 text-left transition-colors hover:border-[color:var(--realm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Trait cards linking back to the collection; Realm resources share one card with in-game icons. */
export function TraitGrid({ attributes, rarity, collectionAddress }: TraitGridProps) {
  const resources = attributes.filter((attribute) => isResourceTrait(attribute.name));
  const others = attributes.filter((attribute) => !isResourceTrait(attribute.name));

  if (attributes.length === 0) {
    return <p className="text-sm text-muted-foreground">No traits indexed.</p>;
  }

  return (
    <ul
      aria-label="Traits"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {resources.length > 0 ? (
        <li className="col-span-2 pb-2 sm:col-span-3 lg:col-span-4">
          <p className={traitNameClassName}>
            {resources[0].name}
          </p>
          <ul aria-label="Resources" className="mt-2 flex flex-wrap gap-2">
            {resources.map((attribute) => {
              const label = resolveResourceIcon(attribute.value)?.label ?? attribute.value;
              const share = rarity?.(attribute.name, attribute.value) ?? null;
              return (
                <li key={`${attribute.name}-${attribute.value}`}>
                  <Link
                    href={traitFilterHref(collectionAddress, attribute.name, attribute.value)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-bg-void)]/60 px-2.5 py-1.5 text-sm transition-colors hover:border-[color:var(--realm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ResourceIcon name={attribute.value} size={20} decorative />
                    <span className="flex flex-col gap-0.5 leading-tight">
                      <span className="font-medium text-foreground">{label}</span>
                      {share ? <ShareNote share={share.share} /> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ) : null}
      {others.map((attribute) => {
        const share = rarity?.(attribute.name, attribute.value) ?? null;
        return (
          <li key={`${attribute.name}-${attribute.value}`} className="min-w-0">
            <Link
              href={traitFilterHref(collectionAddress, attribute.name, attribute.value)}
              className={linkClassName}
            >
              <span className={`break-words ${traitNameClassName}`}>
                {attribute.name}
              </span>
              <span className="break-words text-sm font-medium text-foreground">
                {attribute.value}
              </span>
              {share ? <ShareNote share={share.share} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
