import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceLink } from "./marketplace-link";

vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)} /> }));
afterEach(() => vi.useRealTimers());

it("does no viewport prefetch, ignores passing hover, and prepares deliberate hover/focus", () => {
  vi.useFakeTimers();
  render(<><MarketplaceLink href="/collections/0x123">Collection</MarketplaceLink><MarketplaceLink href="/collections/0x123/6">Token</MarketplaceLink></>);
  const collection = screen.getByRole("link", { name: "Collection" });
  expect(collection).toHaveAttribute("data-prefetch", "false");
  fireEvent.mouseEnter(collection);
  fireEvent.mouseLeave(collection);
  act(() => vi.advanceTimersByTime(150));
  expect(collection).toHaveAttribute("data-prefetch", "false");
  fireEvent.mouseEnter(collection);
  act(() => vi.advanceTimersByTime(150));
  expect(collection).toHaveAttribute("data-prefetch", "true");
  const token = screen.getByRole("link", { name: "Token" });
  fireEvent.focus(token);
  expect(token).toHaveAttribute("data-prefetch", "true");
  expect(token).toHaveAttribute("href", "/collections/0x123/6");
});
