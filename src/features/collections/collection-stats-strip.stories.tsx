import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { prefetchCollectionPage } from "@/lib/marketplace/public-prefetch";
import { CollectionStatsStrip } from "./collection-stats-strip";
import { CURRENCY, useScenario } from "../../../.storybook/scenario";

const meta = {
  title: "Marketplace/Collection stats",
  component: CollectionStatsStrip,
  args: { address: "0xa", currency: CURRENCY },
  parameters: {
    docs: {
      description: {
        component:
          "Floor, top offer, 7-day volume and sales, listed share and supply for one collection in the market currency. Each label explains its source on hover and focus.",
      },
    },
  },
} satisfies Meta<typeof CollectionStatsStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("523")).toBeVisible();
    await expect(canvas.getByText("24")).toBeVisible();
    await expect(canvas.getByText("8000")).toBeVisible();
    await expect(canvas.getByText(/412/)).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "empty" });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No listings")).toBeVisible();
    await expect(canvas.getByText("No offers")).toBeVisible();
  },
};

export const Loading: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "pending" });
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "narrow", isRotated: false } },
};

export const Prefetched: Story = {
  loaders: [async () => {
    const client = new QueryClient();
    try {
      await prefetchCollectionPage(client, { address: "0xa", currency: CURRENCY, params: new URLSearchParams("tab=analytics") });
      return { state: dehydrate(client) };
    } finally { client.clear(); }
  }],
  render: (args, { loaded }) => <HydrationBoundary state={loaded.state}><CollectionStatsStrip {...args} /></HydrationBoundary>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("523")).toBeVisible();
    await expect(canvas.queryByRole("status", { name: "Loading statistic" })).not.toBeInTheDocument();
  },
};
