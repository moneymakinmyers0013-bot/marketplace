import { HomeSkeleton } from "@/components/marketplace/loading-state";
import { Suspense } from "react";
import { MarketplaceHome } from "@/components/marketplace/marketplace-home";
import { HomePageData } from "@/features/home/home-page-data";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  return (
    <Suspense fallback={<HomeSkeleton />}>
      {q ? <MarketplaceHome /> : <HomePageData />}
    </Suspense>
  );
}
