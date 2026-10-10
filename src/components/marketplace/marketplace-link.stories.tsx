import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { MarketplaceLink } from "./marketplace-link";

const meta = { title: "Marketplace/Intent navigation", component: MarketplaceLink,
  args: { href: "/collections/0xa/6", children: "View Realm #6", className: "inline-flex min-h-11 items-center rounded-md border px-4 focus-visible:outline-2 focus-visible:outline-primary" },
} satisfies Meta<typeof MarketplaceLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Keyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const link = canvas.getByRole("link", { name: "View Realm #6" });
    await expect(link).toHaveFocus();
    await expect(link).toHaveAttribute("href", "/collections/0xa/6");
  },
};
