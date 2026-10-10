import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { expect } from "storybook/test";
import { MarketplaceHome } from "@/components/marketplace/marketplace-home";
import { prefetchHomePage } from "@/lib/marketplace/public-prefetch";

const meta = {
  title: "Marketplace/Public page data",
  component: MarketplaceHome,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } } },
  loaders: [async () => {
    const client = new QueryClient();
    try { await prefetchHomePage(client); return { state: dehydrate(client) }; }
    finally { client.clear(); }
  }],
  render: (_args, { loaded }) => <HydrationBoundary state={loaded.state}><MarketplaceHome /></HydrationBoundary>,
} satisfies Meta<typeof MarketplaceHome>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PrefetchedHome: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Realms Market" })).toBeInTheDocument();
    await expect(canvas.queryByRole("status", { name: "Loading featured collection" })).not.toBeInTheDocument();
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
