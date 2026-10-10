import { decodeRangeFilterValue, type ActiveFilters } from "./traits";

/** The same range/exact filters drive browser discovery and server prefetching. */
export function apiFiltersFromActiveFilters(activeFilters: ActiveFilters) {
  return Object.entries(activeFilters).map(([name, values]) => {
    const range = [...values].map(decodeRangeFilterValue).find(Boolean);
    return range ? { name, ...range } : { name, values: [...values].map(value =>
      value === "true" ? true : value === "false" ? false : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value,
    ) };
  });
}
