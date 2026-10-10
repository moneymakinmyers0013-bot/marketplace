import { TokenDetailSkeleton } from "@/components/marketplace/loading-state";
import { Suspense } from "react";
import type { Metadata } from "next";
import { TokenPageData } from "@/features/token/token-page-data";
import { buildMarketplacePageMetadata, shareCardImage } from "@/lib/seo/metadata";
import { tokenShareCopy } from "@/lib/seo/share-copy";

type TokenPageProps = {
  params: Promise<{ address: string; tokenId: string }>;
};

export default async function TokenPage({ params }: TokenPageProps) {
  const { address, tokenId } = await params;

  return (
    <main className="market-page w-full">
      <Suspense fallback={<TokenDetailSkeleton />}>
        <TokenPageData address={address} tokenId={tokenId} />
      </Suspense>
    </main>
  );
}

export async function generateMetadata({
  params,
}: TokenPageProps): Promise<Metadata> {
  const { address, tokenId } = await params;
  const { getTokenShareData } = await import("@/lib/marketplace/seo-data");
  const card = await getTokenShareData(address, tokenId);
  const copy = tokenShareCopy(card);
  const pathname = `/collections/${address}/${tokenId}`;

  return buildMarketplacePageMetadata({
    title: `${card.tokenName} | ${card.collectionName} | Realms.market`,
    socialTitle: copy.socialTitle,
    description: copy.description,
    pathname,
    image: shareCardImage(pathname, card.version, copy.imageAlt),
    noIndex: !card.exists,
  });
}
