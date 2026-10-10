import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { TokenMedia } from "./token-media";
import { HeroBanner } from "@/features/home/hero-banner";
import { CollectionBanner } from "@/features/collections/collection-banner";
const meta = {
  title: "Marketplace/Artwork loading",
  component: TokenMedia,
  decorators: [
    (Story) => (
      <div className="aspect-square w-full max-w-sm overflow-hidden rounded-lg">
        <Story />
      </div>
    ),
  ],
  args: { alt: "Realm artwork", sources: ["/banners/realms.png"] },
} satisfies Meta<typeof TokenMedia>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Artwork: Story = {};
export const Unavailable: Story = { args: { sources: [] } };
export const ResponsiveArtwork: Story = {
  args: { sizes: "(max-width: 420px) calc(100vw - 32px), 384px" },
  play: async ({ canvas }) => {
    const image = canvas.getByRole("img", { name: "Realm artwork" }) as HTMLImageElement;
    await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(0));
    await expect(image.currentSrc).toContain("/optimized/banners/realms-");
  },
};
export const PriorityArtwork: Story = { args: { priority: true, sizes: "384px" } };
export const Banners: Story = {
  decorators: [Story => <div className="w-full"><Story /></div>],
  render: () => <div className="space-y-8">
    <HeroBanner name="Realms" address="0x123" imageUrl="/banners/realms.png" />
    <CollectionBanner name="Realms" image="/banners/realms.png" />
  </div>,
};
