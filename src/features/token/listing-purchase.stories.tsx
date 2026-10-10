import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ListingPurchase } from "./listing-purchase";
import { CURRENCY } from "../../../.storybook/scenario";

const PRICE = "22220000000000000000";

/** The token page's action row: the price lives in the market summary above it. */
const meta = {
  title: "Marketplace/Token trade actions",
  component: ListingPurchase,
  args: {
    price: PRICE,
    currency: CURRENCY,
    showPrice: false,
    onAdd: fn(),
    onViewCart: fn(),
    children: (
      <Button variant="outline" className="min-h-11 w-full">
        Make offer
      </Button>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListingPurchase>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Listed: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const add = canvas.getByRole("button", { name: "Add to cart" });
    const offer = canvas.getByRole("button", { name: "Make offer" });
    await expect(add.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(offer.getBoundingClientRect().height).toBe(
      add.getBoundingClientRect().height,
    );
    await expect(canvas.queryByText("Price")).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Includes marketplace fees and royalties/),
    ).toBeVisible();
    await userEvent.click(add);
    await expect(args.onAdd).toHaveBeenCalledOnce();
  },
};

export const InCart: Story = {
  args: { inCart: true },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "View cart" }));
    await expect(args.onViewCart).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Added to your cart",
    );
  },
};

export const Unlisted: Story = {
  args: {
    price: undefined,
    children: <Button className="min-h-11 w-full">Make offer</Button>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("button")).toHaveLength(1);
    await expect(
      canvas.queryByText(/Includes marketplace fees/),
    ).not.toBeInTheDocument();
  },
};

export const OwnerWithListing: Story = {
  args: {
    isOwner: true,
    children: (
      <>
        <Button className="min-h-11 w-full">List for sale</Button>
        <Button variant="destructive" className="min-h-11 w-full">
          Cancel listing
        </Button>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "You own this item" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Cancel listing" }),
    ).toBeEnabled();
  },
};

export const OwnerWithListingMobile: Story = {
  ...OwnerWithListing,
  globals: { viewport: { value: "narrow", isRotated: false } },
};
