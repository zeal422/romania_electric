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
    // Istoricul se construiește orar prin workflow; la runtime nu are sens
    // să lovim endpoint-ul mai des decât cât durează o sesiune de vizitare.
    staleTime: 5 * 60 * 1000,
  });
}
