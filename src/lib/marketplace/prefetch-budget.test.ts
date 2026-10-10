import { expect, it } from "vitest";
import { createPrefetchBudget } from "./prefetch-budget";

it("bounds intent bursts and deduplicates recently prepared destinations", () => {
  let now = 1000;
  const admit = createPrefetchBudget(() => now);
  expect(admit("/collections/0xa")).toBe(true);
  expect(admit("/collections/0xa")).toBe(false);
  expect(admit("/collections/0xa/1")).toBe(true);
  expect(admit("/collections/0xa/2")).toBe(false);
  now += 1000;
  expect(admit("/collections/0xa/2")).toBe(true);
  expect(admit("/collections/0xa")).toBe(false);
  now += 30_000;
  expect(admit("/collections/0xa")).toBe(true);
});

it("prefetches only public collection/token routes and respects constrained networks", () => {
  const admit = createPrefetchBudget();
  for (const href of ["https://example.com", "//example.com", "/operator", "/profile/0xa", "/notifications", "/collections/0xa/../../operator"]) expect(admit(href)).toBe(false);
  expect(admit("/collections/0xa", { saveData: true })).toBe(false);
  expect(admit("/collections/0xa", { effectiveType: "2g" })).toBe(false);
  expect(admit("/collections/0xa", { effectiveType: "slow-2g" })).toBe(false);
  expect(admit("/collections/0xa?trait=Resource%3AWood", { effectiveType: "4g" })).toBe(true);
});
