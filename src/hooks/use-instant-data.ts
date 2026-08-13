"use client";

import { useQuery } from "@tanstack/react-query";

import type { InstantData } from "@/lib/sen/types";

/**
 * Valorile INSTANT (Consum/Producție/Sold + mix pe surse) de la /api/sen/instant.
 *
 * Polling la 30s (site-ul oficial poll-uiește /sen-filter la 10s — suntem mai
 * blânzi cu serverul lor) + re-fetch la revenirea pe tab (refetchOnWindowFocus
 * global, vezi providers.tsx). La eșec serverul răspunde `null` → UI-ul cade
 * pe summary.latest (comportamentul de dinaintea funcției live).
 */
export function useInstantData() {
  return useQuery<InstantData | null>({
    queryKey: ["sen", "instant"],
    queryFn: async () => {
      const res = await fetch("/api/sen/instant");
      if (!res.ok) throw new Error("Nu am putut încărca valorile instant SEN");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
}
