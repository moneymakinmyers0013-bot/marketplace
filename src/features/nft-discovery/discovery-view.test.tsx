import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiscoveryView, type DiscoveryViewProps } from "./discovery-view";
import { collectionPage, discoveryStatus, holdingPage, tokenPage } from "./fixtures";

const props = (): DiscoveryViewProps => ({
  results: { kind: "collections", page: collectionPage },
  search: { q: "", collection: "", account: "" },
  status: discoveryStatus,
  onViewChange: vi.fn(), onSearchChange: vi.fn(), onSearch: vi.fn(),
  onNext: vi.fn(), onReset: vi.fn(), onRetry: vi.fn(),
});

it("shows coverage limits and exact IDs without a marketplace link or trading action", () => {
  render(<DiscoveryView {...props()} results={{ kind: "tokens", page: tokenPage }} />);
  expect(screen.getByText("Browse only")).toBeVisible();
  expect(screen.getByText(/Explore published observations/)).toHaveTextContent(/historical coverage is incomplete/i);
  expect(screen.getByText(tokenPage.items[0].tokenId)).toBeVisible();
  expect(screen.getByText(tokenPage.items[1].supply)).toBeVisible();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button", { name: /buy|offer|list for sale/i })).toBeNull();
});

it("retains observed holdings during background refresh and displays exact balances", () => {
  render(<DiscoveryView {...props()} results={{ kind: "holdings", page: holdingPage }} refreshing />);
  expect(screen.getByText(holdingPage.items[0].balance)).toBeVisible();
  expect(screen.getByText("Refreshing indexed observations…")).toBeVisible();
  expect(screen.queryByText("Loading indexed observations…")).toBeNull();
});

it("distinguishes initial loading, empty and unsupported results", () => {
  const p = props();
  const { rerender } = render(<DiscoveryView {...p} results={{ kind: "collections" }} loading />);
  expect(screen.getByText("Loading indexed observations…")).toBeVisible();
  expect(screen.queryByText(/No indexed collections match this address/)).toBeNull();
  rerender(<DiscoveryView {...p} results={{ kind: "collections", page: { ...collectionPage, items: [] } }} />);
  expect(screen.getByText(/No indexed collections match this address/)).toBeVisible();
  rerender(<DiscoveryView {...p} results={{ kind: "tokens" }} error={{ kind: "unsupported", message: "This collection is not published in discovery." }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Collection unavailable");
  expect(screen.queryByText(/no indexed tokens/i)).toBeNull();
});

it("delegates input, search, collection selection and page actions to its controller", () => {
  const p = props();
  render(<DiscoveryView {...p} hasPrevious />);
  fireEvent.change(screen.getByRole("textbox", { name: "Search contract address" }), { target: { value: "0x123" } });
  expect(p.onSearchChange).toHaveBeenCalledWith({ q: "0x123" });
  fireEvent.click(screen.getByRole("button", { name: "Search collections" }));
  expect(p.onSearch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getAllByRole("button", { name: "Browse indexed tokens" })[0]);
  expect(p.onViewChange).toHaveBeenCalledWith("tokens", collectionPage.items[0].address);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(p.onNext).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "First page" }));
  expect(p.onReset).toHaveBeenCalledOnce();
});
