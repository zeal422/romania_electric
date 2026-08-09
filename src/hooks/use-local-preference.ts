"use client";

import { useCallback, useSyncExternalStore } from "react";

import { readLocalPreference, writeLocalPreference } from "@/lib/local-preference";

/**
 * Preferință UI persistată în `localStorage`, fără mismatch de hidratare.
 *
 * Implementat cu `useSyncExternalStore` (modul canonic React, același pattern
 * ca `useMounted`): `getServerSnapshot` întoarce `fallback` atât la SSR cât și
 * la prima randare de hidratare (output identic server/client), apoi, după
 * hidratare, React trece la `getSnapshot`, care citește valoarea salvată și
 * re-randează — fără `setState` într-un effect (regula react-hooks) și fără
 * hydration warnings.
 *
 * Logica de citire/scriere (inclusiv protecția la excepții localStorage) e în
 * `src/lib/local-preference.ts` (funcții pure, testate separat fără DOM).
 *
 * Scrierea (`setValue`) actualizează localStorage + notifică toți abonații
 * (inclusiv alte tab-uri prin evenimentul `storage`); dacă storage-ul e
 * indisponibil, scrierea e ignorată în tăcere (fără crash, fără dispatch).
 *
 * @param key cheia din localStorage (ex: "sen:granularity")
 * @param fallback valoarea implicită (server + prima hidratare)
 * @param isValid validator opțional — **type predicate** `(v: string) => v is T`
 *   (nu doar `boolean`): confirmă la runtime că valoarea e din setul lui `T`
 *   (ex: granularități vechi după o schimbare de enum → `fallback`). Dacă e
 *   omis, valoarea citită e `string` brut (hook-ul o expune tot ca `T` prin
 *   contract — vezi `readLocalPreference` pentru semantica tipurilor).
 */
export function useLocalPreference<T extends string>(
  key: string,
  fallback: T,
  isValid?: (v: string) => v is T,
) {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback(
    (): T =>
      // Cu validator: readLocalPreference confirmă tipul (overload tipat → T).
      // Fără validator: întoarce string — hook-ul îl expune ca T (contractul
      // hook-ului rămâne T; callerii serioși trec un validator).
      isValid
        ? readLocalPreference(window.localStorage, key, fallback, isValid)
        : (readLocalPreference(window.localStorage, key, fallback) as T),
    [key, fallback, isValid],
  );

  const getServerSnapshot = useCallback((): T => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      if (!writeLocalPreference(window.localStorage, key, next)) return;
      // useSyncExternalStore se re-randează doar la evenimente `storage`;
      // dispatch-ăm unul propriu ca aceeași fereastră să se actualizeze imediat.
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: next }));
    },
    [key],
  );

  return [value, setValue] as const;
}
