import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { traitShare, useTraitRarity, type TraitFacet } from "./use-trait-rarity";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));

const facets: TraitFacet[] = [
  {
    name: "Resource",
    kind: "string",
    values: [
      { value: "Wood", count: "2000" },
      { value: "Dragonhide", count: "60" },
    ],
  },
  { name: "Cities", kind: "number", values: [{ value: 4, count: "800" }] },
];

describe("traitShare", () => {
  it("returns the count and share of tokens carrying a trait value", () => {
    expect(traitShare(facets, 8000, "Resource", "Wood")).toEqual({
      count: 2000,
      share: 0.25,
    });
  });

  it("matches numeric facet values by their string form", () => {
    expect(traitShare(facets, 8000, "Cities", "4")).toEqual({
      count: 800,
      share: 0.1,
    });
  });

  it("ignores case and surrounding whitespace", () => {
    expect(traitShare(facets, 8000, "resource", " dragonhide ")).toEqual({
      count: 60,
      share: 0.0075,
    });
  });

  it("returns null for unknown traits, unknown values or an unusable token count", () => {
    expect(traitShare(facets, 8000, "Order", "Fox")).toBeNull();
    expect(traitShare(facets, 8000, "Resource", "Moonrock")).toBeNull();
    expect(traitShare(facets, 0, "Resource", "Wood")).toBeNull();
    expect(traitShare(facets, Number.NaN, "Resource", "Wood")).toBeNull();
    expect(traitShare(facets, undefined, "Resource", "Wood")).toBeNull();
    expect(traitShare(undefined, 8000, "Resource", "Wood")).toBeNull();
  });

  it("never reports more than every token", () => {
    expect(
      traitShare(
        [{ name: "Legacy", values: [{ value: "Yes", count: "9000" }] }],
        8000,
        "Legacy",
        "Yes",
      ),
    ).toEqual({ count: 9000, share: 1 });
  });
});

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  Wrapper.displayName = "Wrapper";
  return Wrapper;
}

describe("useTraitRarity", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (path: string) => {
      if (path === "/collections/0xa/traits") return facets;
      if (path === "/collections/0xa")
        return {
          address: "0xa",
          name: "Realms",
          tokenCount: "8000",
          listingCount: "1",
          floorByCurrency: [],
        };
      throw new Error(`Unexpected request ${path}`);
    });
  });

  it("resolves a lookup once facets and the collection size have loaded", async () => {
    const { result } = renderHook(() => useTraitRarity("0xa"), {
      wrapper: makeWrapper(),
    });
    expect(result.current("Resource", "Wood")).toBeNull();
    await waitFor(() =>
      expect(result.current("Resource", "Wood")).toEqual({
        count: 2000,
        share: 0.25,
      }),
    );
    expect(result.current("Order", "Fox")).toBeNull();
    expect(request).toHaveBeenCalledWith("/collections/0xa/traits", {}, undefined, expect.any(AbortSignal));
    expect(request).toHaveBeenCalledWith("/collections/0xa", {}, undefined, expect.any(AbortSignal));
  });

  it("fetches facets and the collection once per collection", async () => {
    const wrapper = makeWrapper();
    const first = renderHook(() => useTraitRarity("0xa"), { wrapper });
    await waitFor(() =>
      expect(first.result.current("Resource", "Wood")).not.toBeNull(),
    );
    first.rerender();
    const second = renderHook(() => useTraitRarity("0xa"), { wrapper });
    await waitFor(() =>
      expect(second.result.current("Resource", "Wood")).not.toBeNull(),
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stays silent when the API answers with unexpected payloads", async () => {
    request.mockImplementation(async (path: string) =>
      path.endsWith("/traits") ? { items: [] } : { tokenCount: "unknown" },
    );
    const { result } = renderHook(() => useTraitRarity("0xa"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(result.current("Resource", "Wood")).toBeNull();
  });

  it("does not request anything without a collection address", () => {
    const { result } = renderHook(() => useTraitRarity(""), {
      wrapper: makeWrapper(),
    });
    expect(result.current("Resource", "Wood")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
