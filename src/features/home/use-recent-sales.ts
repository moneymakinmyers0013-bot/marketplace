"use client";
import { useQuery } from "@tanstack/react-query";
import { recentSalesOptions } from "./home-query-options";

export function useRecentSales(address: string | null | undefined, limit = 8) {
  return useQuery({ ...recentSalesOptions(address, limit), enabled: !!address });
}
