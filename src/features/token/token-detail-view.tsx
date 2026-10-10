"use client";
import {
  TokenDetailSkeleton,
  ListSkeleton,
} from "@/components/marketplace/loading-state";

import { useId, useState } from "react";
import { MarketplaceLink as Link } from "@/components/marketplace/marketplace-link";
import { ChevronLeft } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { prepareCancellation } from "@biblio/marketplace";
import { TokenMedia } from "@/components/marketplace/token-media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/marketplace/section-header";
import { useAddToCartFeedback } from "@/features/cart/hooks/use-add-to-cart-feedback";
import {
  cartItemFromTokenListing,
  cheapestListingByTokenId,
} from "@/features/cart/listing-utils";
import { useCartStore } from "@/features/cart/store/cart-store";
import {
  ListingSharePrompt,
  isSharePromptDismissed,
  rememberSharePromptDismissed,
} from "@/features/share/listing-share-prompt";
import { assetShareText } from "@/features/share/share-links";
import { ShareMenu } from "@/features/share/share-menu";
import { AcceptOffer } from "@/features/trading/accept-offer";
import { BestBid } from "@/features/trading/best-bid";
import { OrderComposer } from "@/features/trading/order-composer";
import { ReportToken } from "@/features/trading/report-token";
import { normalizeMarketplaceAddress } from "@/lib/marketplace/address";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { tokenActivityOptions } from "@/lib/marketplace/public-queries";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import {
  useCollectionListingsQuery,
  useCollectionQuery,
  useTokenDetailQuery,
} from "@/lib/marketplace/hooks";
import { useCollectionOffersQuery } from "@/lib/marketplace/market-data";
import {
  displayTokenId,
  formatAddress,
  getTokenSymbol,
  tokenMediaSources,
  tokenName,
} from "@/lib/marketplace/token-display";
import { useTrade } from "@/lib/marketplace/use-trade";
import { toAbsoluteUrl } from "@/lib/seo/site-url";
import { ListingPurchase } from "./listing-purchase";
import { OfferList } from "./offer-list";
import { TokenActivity } from "./token-activity";
import {
  pickLastSale,
  pickTopOffer,
  TokenMarketSummary,
} from "./token-market-summary";
import { TraitGrid, traitAttributesFromMetadata } from "./trait-grid";
import { useTokenOwnership } from "./use-token-ownership";
import { useTraitRarity } from "./use-trait-rarity";

type ComposerKind = "listing" | "token_offer";

function sameAddress(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left || !right) return false;
  return (
    normalizeMarketplaceAddress(left) === normalizeMarketplaceAddress(right)
  );
}

function sameTokenId(left: string, right: string) {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return left === right;
  }
}

function seedCollectionName(address: string) {
  const target = normalizeMarketplaceAddress(address);
  return getMarketplaceRuntimeConfig().collections.find(
    (collection) => normalizeMarketplaceAddress(collection.address) === target,
  )?.name;
}

function displayPrice(amount: string, currency: string) {
  return `${formatCurrencyAmount(amount, currency)} ${getTokenSymbol(currency)}`;
}

const focusRing =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TokenDetailView({
  address,
  tokenId,
  projectId,
}: {
  address: string;
  tokenId: string;
  projectId?: string;
}) {
  const detail = useTokenDetailQuery({
    collection: address,
    tokenId,
    projectId,
    fetchImages: true,
  });
  const collection = useCollectionQuery({ address, projectId });
  const listings = useCollectionListingsQuery({
    collection: address,
    tokenId,
    projectId,
  });
  const trade = useTrade();
  const ownership = useTokenOwnership({
    collection: address,
    tokenId,
    walletAddress: trade.address,
    isConnected: !!trade.address,
  });
  const rarity = useTraitRarity(address);
  const cartItems = useCartStore((s) => s.items);
  const setCartOpen = useCartStore((s) => s.setOpen);
  const { addListingToCart } = useAddToCartFeedback();
  const offers = useCollectionOffersQuery(address, {
    tokenMatch: tokenId,
    limit: 50,
  });
  const activity = useInfiniteQuery(tokenActivityOptions(address, tokenId));
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [dismissedShareFor, setDismissedShareFor] = useState<string | null>(null);
  const composerId = useId();
  const sectionId = useId();

  const offerItems = (
    offers.data?.pages.flatMap((page) => page.items) ?? []
  ).filter(
    (order) =>
      order.kind !== "listing" &&
      (order.tokenId == null || sameTokenId(order.tokenId, tokenId)),
  );
  const activityItems =
    activity.data?.pages.flatMap((page) => page.items) ?? [];

  if (detail.isLoading) return <TokenDetailSkeleton />;
  if (detail.isError || !detail.data?.token)
    return (
      <Card>
        <CardContent className="space-y-3 p-8">
          <p role="alert">Unable to load this token.</p>
          <Button className="min-h-11" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );

  const token = detail.data.token;
  const name = tokenName(token);
  const metadata = token.metadata as { description?: unknown } | null;
  const description =
    typeof metadata?.description === "string" && metadata.description.trim()
      ? metadata.description
      : null;
  const attributes = traitAttributesFromMetadata(token.metadata);
  const collectionName =
    collection.data?.metadata?.name ??
    seedCollectionName(address) ??
    formatAddress(address);

  const tokenListings = listings.data ?? [];
  const cheapest = cheapestListingByTokenId(tokenListings).get(
    BigInt(tokenId).toString(),
  );
  const myListing = tokenListings.find((listing) =>
    sameAddress(listing.owner, trade.address),
  );
  const isOwner = ownership.effectiveIsOwner;
  const owner =
    ownership.holderAddress ?? (isOwner ? (trade.address ?? null) : null);

  // Like the link preview, only price the share text from the holder's own
  // listings; a previous owner's listing can linger in the index.
  const holder = ownership.holderAddress;
  const shareListing = holder
    ? cheapestListingByTokenId(
        tokenListings.filter((listing) => sameAddress(listing.owner, holder)),
      ).get(BigInt(tokenId).toString())
    : cheapest;
  const shareTarget = {
    url: toAbsoluteUrl(`/collections/${address}/${tokenId}`),
    title: `${name} | ${collectionName} | Realms.market`,
    text: assetShareText({
      name,
      price: shareListing
        ? displayPrice(shareListing.price, shareListing.currency)
        : null,
    }),
  };
  // Listings come from the index, so an owner's listing here is already
  // reflected; the link preview picks up its price once its cache refreshes.
  const sharePrompt =
    isOwner &&
    myListing &&
    dismissedShareFor !== myListing.id &&
    !isSharePromptDismissed(myListing.id)
      ? myListing
      : null;

  const toggleComposer = (kind: ComposerKind) =>
    setComposer((current) => (current === kind ? null : kind));

  const tokenLabel = `#${displayTokenId(token)}`;
  const offerAction = (
    <Button
      className="min-h-11 w-full"
      variant={composer === "token_offer" || cheapest ? "outline" : "default"}
      aria-expanded={composer === "token_offer"}
      aria-controls={composerId}
      onClick={() => toggleComposer("token_offer")}
    >
      {composer === "token_offer" ? "Close" : "Make offer"}
    </Button>
  );
  const ownerActions = (
    <>
      <Button
        className="min-h-11 w-full"
        variant={composer === "listing" ? "outline" : "default"}
        aria-expanded={composer === "listing"}
        aria-controls={composerId}
        onClick={() => toggleComposer("listing")}
      >
        {composer === "listing" ? "Close" : "List for sale"}
      </Button>
      {myListing ? (
        <Button
          variant="destructive"
          className="min-h-11 w-full"
          disabled={trade.busy}
          onClick={() =>
            void trade.execute(
              (marketplace) =>
                prepareCancellation(
                  {
                    marketplace,
                    chain: trade.config!.chain,
                    account: trade.address!,
                  },
                  [myListing.id],
                ),
              "cancel",
            )
          }
        >
          Cancel listing
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8" data-testid="token-detail">
      <header className="space-y-2">
        <nav aria-label="Breadcrumb" className="-mt-2 text-sm">
          <Link
            href={`/collections/${address}`}
            className={`inline-flex min-h-11 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span>{collectionName}</span>
          </Link>
        </nav>
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="market-page-title min-w-0 break-words">{name}</h1>
            <ShareMenu target={shareTarget} className="shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            {/* The name usually carries the token number already. */}
            {name.includes(tokenLabel) ? null : (
              <span className="font-mono text-muted-foreground">
                {tokenLabel}
              </span>
            )}
            <span className="market-chip text-muted-foreground">ERC-721</span>
            <span className="inline-flex items-center gap-2">
              <span className="market-label">Owner</span>
              {owner ? (
                <Link
                  href={`/profile/${owner}`}
                  title={owner}
                  className={`inline-flex min-h-11 items-center font-mono text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-current ${focusRing}`}
                >
                  {formatAddress(owner)}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center text-muted-foreground">
                  Not indexed
                </span>
              )}
              {owner && isOwner ? <Badge variant="secondary">You</Badge> : null}
            </span>
          </div>
          {description ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        {/* Artwork keeps its own proportions; a square holds the space until it loads. */}
        <div className="realm-panel relative overflow-hidden">
          <TokenMedia
            sources={tokenMediaSources(token)}
            alt={name}
            priority
            className="block h-auto max-h-[min(80vh,48rem)] [aspect-ratio:auto_1/1] object-contain"
            fallbackClassName="aspect-square h-auto"
            fallbackLabel="Artwork unavailable"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </div>
        <div className="space-y-4">
          <TokenMarketSummary
            priceLoading={listings.isPending}
            offersLoading={offers.isPending}
            activityLoading={activity.isPending}
            price={cheapest?.price}
            currency={cheapest?.currency}
            topOffer={pickTopOffer(offerItems, cheapest?.currency)}
            lastSale={pickLastSale(activityItems)}
            listedCount={tokenListings.length}
          />
          {sharePrompt ? (
            <ListingSharePrompt
              target={shareTarget}
              price={displayPrice(sharePrompt.price, sharePrompt.currency)}
              onDismiss={() => {
                rememberSharePromptDismissed(sharePrompt.id);
                setDismissedShareFor(sharePrompt.id);
              }}
            />
          ) : null}
          {listings.isError ? (
            <div className="rounded-lg border border-destructive/30 p-3">
              <p role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>Listing prices are unavailable.</span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void listings.refetch()}
                >
                  Retry
                </Button>
              </p>
            </div>
          ) : null}
          {/* The price tile shows the listing; this row holds the actions. */}
          <ListingPurchase
            showPrice={false}
            price={listings.isPending ? undefined : cheapest?.price}
            currency={cheapest?.currency}
            inCart={
              !!cheapest &&
              cartItems.some((item) => item.orderId === cheapest.orderId)
            }
            isOwner={isOwner}
            onViewCart={() => setCartOpen(true)}
            onAdd={() => {
              if (cheapest)
                addListingToCart(
                  cartItemFromTokenListing(token, address, cheapest),
                );
            }}
          >
            {isOwner ? ownerActions : offerAction}
          </ListingPurchase>
          {composer ? (
            <div id={composerId} className="realm-panel p-4 sm:p-5">
              <OrderComposer
                collection={address}
                tokenIds={[tokenId]}
                kind={composer}
              />
            </div>
          ) : null}
        </div>
      </div>

      <section
        aria-labelledby={`${sectionId}-traits`}
        className="realm-panel space-y-4 p-4 sm:p-5"
      >
        <SectionHeader
          id={`${sectionId}-traits`}
          title="Traits"
          count={attributes.length > 0 ? attributes.length : undefined}
        />
        <TraitGrid
          attributes={attributes}
          rarity={rarity}
          collectionAddress={address}
        />
      </section>

      <OfferList
        orders={offerItems}
        loading={offers.isPending}
        error={offers.isError}
        hasMore={offers.hasNextPage}
        loadingMore={offers.isFetchingNextPage}
        onRetry={() => void offers.refetch()}
        onMore={() => void offers.fetchNextPage()}
        renderAction={
          isOwner
            ? (order) => <AcceptOffer order={order} tokenId={tokenId} />
            : undefined
        }
      >
        <BestBid collection={address} tokenId={tokenId} isOwner={isOwner} />
      </OfferList>

      <section
        aria-labelledby={`${sectionId}-activity`}
        className="realm-panel space-y-4 p-4 sm:p-5"
      >
        <SectionHeader id={`${sectionId}-activity`} title="Activity" />
        {activityItems.length ? (
          <TokenActivity
            items={activityItems}
            chain={getMarketplaceRuntimeConfig().chainLabel}
          />
        ) : activity.isPending ? (
          <ListSkeleton label="Loading activity" compact />
        ) : (
          <p className="text-sm text-muted-foreground">
            {activity.isError
              ? "Activity is unavailable. Try again shortly."
              : "No indexed activity yet."}
          </p>
        )}
        {activity.hasNextPage ? (
          <Button
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={activity.isFetchingNextPage}
            onClick={() => void activity.fetchNextPage()}
          >
            More activity
          </Button>
        ) : null}
      </section>

      <ReportToken collection={address} tokenId={tokenId} />
    </div>
  );
}
