import type { NormalizedToken } from "@/lib/marketplace/types";
import { normalizeCollectionTokenId } from "@/lib/marketplace/token-id";
import { tokenMediaCandidates } from "@/lib/marketplace/media-url";

function normalizeMetadata(token: NormalizedToken) {
  return token.metadata as Record<string, unknown> | null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function traitValue(token: NormalizedToken, traitName: string) {
  const attributes = normalizeMetadata(token)?.attributes;
  if (!Array.isArray(attributes)) {
    return null;
  }

  for (const rawAttribute of attributes) {
    const attribute = asRecord(rawAttribute);
    if (!attribute) {
      continue;
    }

    const resolvedTraitName = attribute.trait_type ?? attribute.traitName ?? attribute.name;
    if (typeof resolvedTraitName !== "string" || resolvedTraitName.trim() !== traitName) {
      continue;
    }

    const value = attribute.value ?? attribute.traitValue;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function chestSource(token: NormalizedToken) {
  const source = traitValue(token, "Source");
  if (source === "Blitz" || source === "S0") {
    return source;
  }

  return null;
}

function normalizeStatus(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return "placed";
    if (value === 2) return "canceled";
    if (value === 3) return "executed";
    if (value === 0) return "none";
    return null;
  }

  if (typeof value === "bigint") {
    if (value === BigInt(1)) return "placed";
    if (value === BigInt(2)) return "canceled";
    if (value === BigInt(3)) return "executed";
    if (value === BigInt(0)) return "none";
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return normalizeStatus(record.value ?? record.status ?? record.state);
}

const WEI_DECIMALS = 18;
const MIN_AUTO_SCALE_DIGITS = 15;

export function tokenId(token: NormalizedToken) {
  return String(token.token_id ?? "unknown");
}

export function formatNumberish(value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toLocaleString("fullwide", { useGrouping: false });
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
      return BigInt(normalized).toString();
    }

    return normalized;
  }

  return null;
}

export function formatPriceForDisplay(value: unknown) {
  const normalized = formatNumberish(value);
  if (!normalized) {
    return null;
  }

  if (!/^-?\d+$/.test(normalized)) {
    return normalized;
  }

  if (normalized.replace("-", "").length < MIN_AUTO_SCALE_DIGITS) {
    return normalized;
  }

  try {
    const parsed = BigInt(normalized);
    const isNegative = parsed < BigInt(0);
    const absolute = isNegative ? -parsed : parsed;
    const divisor = BigInt(10) ** BigInt(WEI_DECIMALS);
    const whole = absolute / divisor;
    const remainder = absolute % divisor;
    const sign = isNegative ? "-" : "";

    if (remainder === BigInt(0)) {
      return `${sign}${whole.toString()}`;
    }

    const fractional = remainder
      .toString()
      .padStart(WEI_DECIMALS, "0")
      .replace(/0+$/, "");

    return `${sign}${whole.toString()}.${fractional}`;
  } catch {
    return normalized;
  }
}

export function displayTokenId(token: NormalizedToken) {
  return formatNumberish(token.token_id) ?? "unknown";
}

/**
 * The "#id" caption shown under a token name, or null when the name already
 * ends with that id ("Realm #0", "Beasts 42") and the caption would repeat it.
 */
export function tokenIdCaption(name: string, id: string): string | null {
  const trimmed = name.trim();
  if (trimmed.endsWith(id)) {
    const before = trimmed.charAt(trimmed.length - id.length - 1);
    if (!/[0-9a-z]/i.test(before)) return null;
  }
  return `#${id}`;
}

export function tokenName(token: NormalizedToken) {
  const name = normalizeMetadata(token)?.name;
  const source = chestSource(token);
  if (source && typeof name === "string" && /chest/i.test(name)) {
    return name.startsWith(`${source} `) ? name : `${source} ${name}`;
  }
  return typeof name === "string" && name.trim()
    ? name
    : source
      ? `${source} Chest #${displayTokenId(token)}`
      : `Token #${displayTokenId(token)}`;
}

/**
 * Every displayable media URL for a token, best first: the shared chest
 * placeholder for Loot Chests, then the cached asset, then each origin the
 * metadata exposes (IPFS references are rewritten to public gateways).
 */
export function tokenMediaSources(token: NormalizedToken): string[] {
  const chestType = chestSource(token);
  if (chestType === "Blitz") {
    return ["/placeholders/blitz-chest.svg"];
  }
  if (chestType === "S0") {
    return ["/placeholders/s0-chest.svg"];
  }

  return tokenMediaCandidates({ image: token.image, metadata: token.metadata });
}

export function tokenImage(token: NormalizedToken) {
  return tokenMediaSources(token)[0] ?? null;
}

export function formatAddress(address: string) {
  if (/^0x[0-9a-fA-F]{9,}$/i.test(address)) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return address;
}

export function tokenPrice(token: NormalizedToken) {
  const fields = token as unknown as Record<string, unknown>;
  const metadata = normalizeMetadata(token);

  const candidates = [
    fields.price,
    fields.listing_price,
    fields.listingPrice,
    metadata?.price,
    metadata?.listing_price,
    metadata?.listingPrice,
  ];

  for (const candidate of candidates) {
    const normalized = formatNumberish(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// M1: Token symbol, explorer URL, relative expiry
// ---------------------------------------------------------------------------

const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK",
  "0x42dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b": "SURVIVO",
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49": "LORDS",
};

const KNOWN_TOKEN_ICONS: Record<string, string> = {
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "/tokens/strk.svg",
  "0x42dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b": "/tokens/survivo.jpg",
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49": "/tokens/lords.png",
};

function normalizeTokenAddress(address: string): string {
  try {
    return `0x${BigInt(address.toLowerCase()).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
}

// Build lookup maps with normalized keys so leading-zero variants all resolve correctly.
const TOKEN_SYMBOLS_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_TOKEN_SYMBOLS).map(([addr, sym]) => [normalizeTokenAddress(addr), sym]),
);

const TOKEN_ICONS_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_TOKEN_ICONS).map(([addr, icon]) => [normalizeTokenAddress(addr), icon]),
);

export function getTokenSymbol(address: string): string {
  const normalized = normalizeTokenAddress(address);
  return TOKEN_SYMBOLS_NORMALIZED[normalized] ?? formatAddress(address);
}

export function getTokenIconUrl(address: string): string | null {
  const normalized = normalizeTokenAddress(address);
  return TOKEN_ICONS_NORMALIZED[normalized] ?? null;
}

export function buildExplorerTxUrl(
  chainLabel: string,
  txHash: string,
): string {
  const base =
    chainLabel === "SN_MAIN"
      ? "https://starkscan.co"
      : "https://sepolia.starkscan.co";
  return `${base}/tx/${txHash}`;
}

export function formatRelativeExpiry(epochSeconds: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diffSeconds = epochSeconds - nowSeconds;

  if (diffSeconds <= 0) return "Expired";

  const diffDays = Math.floor(diffSeconds / 86400);
  if (diffDays >= 1) {
    return diffDays === 1 ? "Expires in 1 day" : `Expires in ${diffDays} days`;
  }

  const diffHours = Math.floor(diffSeconds / 3600);
  if (diffHours >= 1) {
    return diffHours === 1 ? "Expires in 1 hour" : `Expires in ${diffHours} hours`;
  }

  return "Expires soon";
}

export function listingPriceByTokenId(listings: unknown[] | undefined) {
  const prices = new Map<string, string>();
  const nowEpochSeconds = BigInt(Math.floor(Date.now() / 1000));

  for (const listing of listings ?? []) {
    const fields = asRecord(listing);
    if (!fields) {
      continue;
    }

    const nestedOrder = asRecord(fields.order);
    const status =
      normalizeStatus(fields.status) ??
      normalizeStatus(fields.state) ??
      normalizeStatus(nestedOrder?.status) ??
      normalizeStatus(nestedOrder?.state);
    const listingTokenIdRaw =
      formatNumberish(fields.tokenId) ??
      formatNumberish(fields.token_id) ??
      formatNumberish(nestedOrder?.tokenId) ??
      formatNumberish(nestedOrder?.token_id);
    const listingTokenId = listingTokenIdRaw
      ? normalizeCollectionTokenId(listingTokenIdRaw)
      : null;
    const listingPrice =
      formatNumberish(fields.price) ??
      formatNumberish(fields.listing_price) ??
      formatNumberish(fields.listingPrice) ??
      formatNumberish(nestedOrder?.price) ??
      formatNumberish(nestedOrder?.listing_price) ??
      formatNumberish(nestedOrder?.listingPrice);
    const expiration =
      formatNumberish(fields.expiration) ??
      formatNumberish(fields.expires_at) ??
      formatNumberish(fields.expiresAt) ??
      formatNumberish(nestedOrder?.expiration) ??
      formatNumberish(nestedOrder?.expires_at) ??
      formatNumberish(nestedOrder?.expiresAt);
    if (!listingTokenId || !listingPrice) {
      continue;
    }
    if (status && status !== "placed") {
      continue;
    }
    if (expiration) {
      try {
        const expiry = BigInt(expiration);
        if (expiry > BigInt(0) && expiry <= nowEpochSeconds) {
          continue;
        }
      } catch {
        // Ignore malformed expiration values.
      }
    }

    const currentPrice = prices.get(listingTokenId);
    if (!currentPrice) {
      prices.set(listingTokenId, listingPrice);
      continue;
    }

    try {
      if (BigInt(listingPrice) < BigInt(currentPrice)) {
        prices.set(listingTokenId, listingPrice);
      }
    } catch {
      // Keep previous value if either price can't be safely parsed as bigint.
    }
  }

  return prices;
}
