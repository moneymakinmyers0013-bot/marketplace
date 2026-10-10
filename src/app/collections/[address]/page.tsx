import { CollectionPageSkeleton } from "@/components/marketplace/loading-state";
import { Suspense } from "react";
import type { Metadata } from "next";
import { CollectionPageData } from "@/features/collections/collection-page-data";
import { buildMarketplacePageMetadata, shareCardImage } from "@/lib/seo/metadata";
import { collectionShareCopy } from "@/lib/seo/share-copy";

type CollectionPageProps = {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { address } = await params;
  const search = await searchParams;

  return (
    <main className="flex min-h-screen w-full items-start px-4 pb-6 sm:px-6">
      <Suspense fallback={<CollectionPageSkeleton />}>
        <CollectionPageData address={address} search={search} />
      </Suspense>
    </main>
  );
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { address } = await params;
  const { getCollectionShareData } = await import("@/lib/marketplace/seo-data");
  const card = await getCollectionShareData(address);
  const copy = collectionShareCopy(card);
  const pathname = `/collections/${address}`;

  return buildMarketplacePageMetadata({
    title: `${copy.title} | Realms.market`,
    description: copy.description,
    pathname,
    image: shareCardImage(pathname, card.version, copy.imageAlt),
    noIndex: !card.exists,
  });
}
