"use client";

import { useQuery } from "@tanstack/react-query";

import type { CostsApiResponse } from "@/lib/sen/types";

/**
 * Preia costurile estimate (import/export, pe baza prețurilor PZU) pentru un
 * interval. Polling la 5 min, ca datele grafice — prețurile se actualizează
 * zilnic, iar volumele live vin din aceeași serie.
 */
export function useSenCosts(from: number | undefined, to: number | undefined) {
  const params = new URLSearchParams();
  if (from !== undefined) params.set("from", String(from));
  if (to !== undefined) params.set("to", String(to));

  return useQuery<CostsApiResponse>({
    queryKey: ["sen", "costs", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/sen/costs?${params.toString()}`);
      if (!res.ok) throw new Error("Nu am putut încărca costurile SEN");
      return res.json();
    },
    enabled: from !== undefined && to !== undefined,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}
