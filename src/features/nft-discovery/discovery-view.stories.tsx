import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { DiscoveryView, type DiscoveryViewProps } from "./discovery-view";
import { collectionPage, discoveryStatus, exampleAccount, exampleCollection, holdingPage, tokenPage } from "./fixtures";

function ControlledDiscovery(args: DiscoveryViewProps) {
  const [search, setSearch] = useState(args.search);
  return <div className="min-h-screen bg-background p-4"><DiscoveryView {...args} search={search} onSearchChange={change => { args.onSearchChange(change); setSearch(current => ({ ...current, ...change })); }} /></div>;
}

const meta = {
  title: "Discovery/NFT index",
  component: DiscoveryView,
  parameters: { layout: "fullscreen" },
  args: {
    results: { kind: "collections", page: collectionPage }, search: { q: "", collection: "", account: "" }, status: discoveryStatus,
    onViewChange: fn(), onSearchChange: fn(), onSearch: fn(), onNext: fn(), onReset: fn(), onRetry: fn(),
  },
  render: args => <ControlledDiscovery {...args} />,
} satisfies Meta<typeof DiscoveryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByRole("textbox", { name: "Search contract address" });
    await userEvent.click(input);
    await userEvent.type(input, "0xabc");
    await expect(input).toHaveValue("0xabc");
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Search collections" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSearch).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getAllByRole("button", { name: "Browse indexed tokens" })[0]);
    await expect(args.onViewChange).toHaveBeenCalledWith("tokens", exampleCollection);
    await userEvent.click(canvas.getByText("Discovery coverage and checkpoint"));
    await expect(canvas.getByText("RPC range awaiting retry", { exact: false })).toBeVisible();
    await expect(canvas.queryByRole("link")).toBeNull();
  },
};
export const Loading: Story = {
  args: { results: { kind: "collections" }, loading: true, status: undefined },
  play: async ({ canvas }) => { await expect(canvas.getByText("Loading indexed observations…")).toBeVisible(); await expect(canvas.queryByText(/no indexed collections/i)).toBeNull(); },
};
export const Empty: Story = { args: { results: { kind: "collections", page: { ...collectionPage, items: [], nextCursor: null } } } };
export const Error: Story = {
  args: { results: { kind: "collections" }, error: { kind: "error", message: "The discovery service is unavailable. Retry to check again." }, statusError: true, status: undefined },
  play: async ({ canvas, userEvent, args }) => { await userEvent.click(canvas.getByRole("button", { name: "Retry discovery" })); await expect(args.onRetry).toHaveBeenCalledOnce(); },
};
export const UnsupportedCollection: Story = { args: { results: { kind: "tokens" }, search: { q: "", collection: exampleCollection, account: "" }, error: { kind: "unsupported", message: "This collection is not published in discovery. It may be unsupported or awaiting review." } } };
export const Tokens: Story = {
  args: { results: { kind: "tokens", page: tokenPage }, search: { q: "", collection: exampleCollection, account: "" } },
  play: async ({ canvas }) => { await expect(canvas.getByText(tokenPage.items[0].tokenId)).toBeVisible(); await expect(canvas.getByText("Metadata unavailable")).toBeVisible(); await expect(canvas.getByText("Metadata pending")).toBeVisible(); },
};
export const Holdings: Story = { args: { results: { kind: "holdings", page: holdingPage }, search: { q: "", collection: "", account: exampleAccount } } };
export const AwaitingAccount: Story = { args: { results: { kind: "holdings" }, awaitingInput: true } };
export const InvalidAccount: Story = { args: { results: { kind: "holdings" }, search: { q: "", collection: "", account: "not-an-address" }, error: { kind: "input", message: "Enter a valid Starknet account address." } } };
export const ExpiredPage: Story = { args: { results: { kind: "collections" }, hasPrevious: true, error: { kind: "error", message: "This page expired after an index update. Return to the first page to continue." } }, play: async ({ canvas, userEvent, args }) => { await userEvent.click(canvas.getByRole("button", { name: "Return to first page" })); await expect(args.onReset).toHaveBeenCalledOnce(); } };
export const Pagination: Story = {
  args: { hasPrevious: true },
  play: async ({ canvas, userEvent, args }) => { await userEvent.click(canvas.getByRole("button", { name: "Next page" })); await expect(args.onNext).toHaveBeenCalledOnce(); await userEvent.click(canvas.getByRole("button", { name: "First page" })); await expect(args.onReset).toHaveBeenCalledOnce(); },
};
export const Refreshing: Story = { args: { results: { kind: "tokens", page: tokenPage }, refreshing: true }, play: async ({ canvas }) => { await expect(canvas.getByText(tokenPage.items[0].tokenId)).toBeVisible(); await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled(); } };
export const Narrow: Story = { args: Tokens.args, globals: { viewport: { value: "narrow", isRotated: false } }, play: async ({ canvasElement }) => { await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth); } };
