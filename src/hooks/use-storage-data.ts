"use client";

import { useQuery } from "@tanstack/react-query";

import type { StorageApiResponse } from "@/lib/sen/types";

/** Preia stocarea (ISPOZ): valoarea curentă + seria acumulată de capturi. */
export function useStorageData() {
  return useQuery<StorageApiResponse>({
    queryKey: ["sen", "storage"],
    queryFn: async () => {
      const res = await fetch("/api/sen/storage");
      if (!res.ok) throw new Error("Nu am putut încărca datele de stocare");
      return res.json();
    },
    // Polling la 60s: valoarea curentă se actualizează la fiecare TTL server
    // (~3 min, vezi storage.ts) — cardul nu mai stă ore întregi pe aceeași valoare.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
