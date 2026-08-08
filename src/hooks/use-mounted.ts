"use client";

import { useSyncExternalStore } from "react";

/**
 * Returnează `true` doar după ce componenta a fost montată pe client.
 *
 * Implementat cu `useSyncExternalStore`, modul canonic React 18 pentru a
 * detecta mediul client/server FĂRĂ a declanșa mismatch de hidratare și
 * FĂRĂ `setState` într-un effect (regula `react-hooks/set-state-in-effect`).
 *
 * Mecanism: React folosește `getServerSnapshot` atât la SSR cât și la prima
 * randare de hidratare (returnează `false` → output identic server/client),
 * apoi, după hidratare, trece la `getSnapshot` (returnează `true`) și
 * re-randează. Astfel nu există mismatch și nici efect cu setState.
 *
 * Utilizare tipică: componentele care citesc stare dependentă de browser
 * (ex: `next-themes` `resolvedTheme`, `localStorage`, `matchMedia`).
 */
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false, // server snapshot (folosit și la hidratarea inițială)
  );
}
