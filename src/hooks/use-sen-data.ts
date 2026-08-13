"use client";

import { useQuery } from "@tanstack/react-query";

import type { Granularity, SenApiResponse, SenSummaryResponse } from "@/lib/sen/types";

/**
 * Preia KPI-ul global precalculat (cea mai recentă înregistrare + statistici).
 * Polling la 60s — citirea e ieftină (cache server TTL 10 min pe sen-grafic);
 * rolul intervalului e să aducă punctul nou la ~1-2 min după publicare.
 */
export function useSenSummary() {
  return useQuery<SenSummaryResponse>({
    queryKey: ["sen", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/sen/summary");
      if (!res.ok) throw new Error("Nu am putut încărca sumarul SEN");
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

/**
 * Preia datele agregate într-un interval cu o granularitate dată.
 * @param from ts început (inclusiv)
 * @param to ts sfârșit (inclusiv)
 * @param granularity raw | 10m | hour | day
 */
export function useSenData(
  from: number | undefined,
  to: number | undefined,
  granularity: Granularity,
) {
  const params = new URLSearchParams();
  if (from !== undefined) params.set("from", String(from));
  if (to !== undefined) params.set("to", String(to));
  params.set("granularity", granularity);

  return useQuery<SenApiResponse>({
    queryKey: ["sen", "data", from, to, granularity],
    queryFn: async () => {
      const res = await fetch(`/api/sen?${params.toString()}`);
      if (!res.ok) throw new Error("Nu am putut încărca datele SEN");
      return res.json();
    },
    enabled: from !== undefined && to !== undefined,
    // Polling la 5 min: sursa (sen-grafic) are cadență ~10 min; intervalul
    // doar aduce punctul nou mai devreme, fără să batem API-ul inutil.
    refetchInterval: 5 * 60_000,
  });
}
