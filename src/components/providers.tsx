"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useState } from "react";

/**
 * Providers clienți: ThemeProvider (light/dark cu preferință system) și
 * QueryClientProvider (cache pentru datele server-ului). QueryClient se creează
 * o singură dată per componentă pentru a evita re-instanțierea la re-render.
 *
 * `refetchOnWindowFocus: true`: revenirea pe tab reîmprospătează datele
 * (aceeași experiență ca pe site-ul Transelectrica — reveni pe tab, valori
 * deja proaspete). Frecvența exactă vine din refetchInterval-ul fiecărui hook.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // Revenirea pe tab reîmprospătează query-urile stale — live feedback
            // real, ca pe site-ul sursei (vezi comentariul din antet).
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextThemesProvider>
  );
}
