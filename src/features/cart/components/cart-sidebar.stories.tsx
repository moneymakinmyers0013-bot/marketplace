import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { TransactionFeedback } from "@/features/trading/transaction-feedback";
import { CartSidebar } from "./cart-sidebar";
import { useCartStore } from "../store/cart-store";
import { cartItem, useScenario } from "../../../../.storybook/scenario";
import { signCalls } from "../../../../.storybook/mocks/trade";
const meta = {
  title: "Trading/Cart",
  component: CartSidebar,
  decorators: [Story => <><TransactionFeedback /><Story /></>],
  parameters: { layout: "fullscreen" },
  beforeEach() {
    useScenario.setState({ connected: true });
    useCartStore.setState({ items: [cartItem], isOpen: true });
  },
} satisfies Meta<typeof CartSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReadyToCheckout: Story = {};
export const OpenWithKeyboard: Story = {
  beforeEach() { useCartStore.setState({ isOpen: false }); },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Cart (1)" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "Checkout" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Empty: Story = {
  beforeEach() {
    useCartStore.setState({ items: [] });
  },
};
export const WalletRequired: Story = {
  beforeEach() {
    useScenario.setState({ connected: false });
  },
};
export const DemoDisabled: Story = {
  beforeEach() {
    useScenario.setState({ demo: true });
  },
};
export const RemoveItem: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await document.findByRole("button", { name: "Remove Realm #1" }),
    );
    await expect(document.getByText("Your cart is empty.")).toBeVisible();
  },
};
export const ListingUnavailable: Story = {
  beforeEach() {
    useScenario.setState({ preflight: "unavailable" });
  },
  play: async ({ canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await document.findByRole("button", { name: "Checkout" }),
    );
    await expect(
      await document.findByText("This listing is no longer available."),
    ).toBeVisible();
    await expect(signCalls).not.toHaveBeenCalled();
    await expect(useCartStore.getState().items).toHaveLength(1);
  },
};
export const WalletRejected: Story = {
  beforeEach() {
    useScenario.setState({ tradeOutcome: "rejected" });
  },
  play: async ({ canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await document.findByRole("button", { name: "Checkout" }),
    );
    await expect(await document.findByRole("alert")).toHaveTextContent(
      "Transaction rejected",
    );
    await expect(useCartStore.getState().items).toHaveLength(1);
  },
};
export const SuccessfulCheckout: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await document.findByRole("button", { name: "Checkout" }),
    );
    await expect(
      await document.findByText("Your cart is empty."),
    ).toBeVisible();
    await expect(signCalls).toHaveBeenCalledOnce();
    await expect(document.getByRole("status")).toHaveTextContent(
      "Trade confirmed",
    );
  },
};
export const ConnectFromCart: Story = {
  beforeEach() { useScenario.setState({ connected: false }); },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", {name:"Connect wallet to checkout"}));
    await userEvent.click(await body.findByRole("button", {name:"Controller"}));
    await expect(await body.findByRole("button", {name:"Checkout"})).toBeEnabled();
    await expect(useCartStore.getState().items).toHaveLength(1);
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
