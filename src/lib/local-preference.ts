/**
 * Logică pură de citire/scriere a preferințelor din `localStorage`, extrasă din
 * `src/hooks/use-local-preference.ts` ca să fie testabilă fără DOM.
 *
 * Funcțiile primesc un obiect storage injectat (tip `Pick<Storage, ...>`),
 * deci se pot testa cu un fake care aruncă excepții — fără jsdom, fără React.
 */

export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Citește o preferință ca string brut, cu protecție la excepții:
 * - storage indisponibil (aruncă) → `fallback`
 * - cheie lipsă (`null`) → `fallback`
 * - valoare invalidă conform `isValid` → `fallback`
 * - valoare validă → valoarea (ca string, NU JSON)
 *
 * Tipul de întoarcere depinde de prezența unui validator:
 * - **fără `isValid`**: întoarce `string` — valoarea stocată nu e garantată a fi
 *   din setul lui `T`, deci NU mintim că e `T` (un `raw as T` ar fi o minciună
 *   de tip: la runtime poate fi orice string).
 * - **cu `isValid`**: întoarce `T` — validatorul trebuie să fie un **type
 *   predicate** (`(v: string) => v is T`) ca tipul să fie confirmat la runtime.
 */
export function readLocalPreference(
  storage: Pick<PrefStorage, "getItem">,
  key: string,
  fallback: string,
): string;
export function readLocalPreference<T extends string>(
  storage: Pick<PrefStorage, "getItem">,
  key: string,
  fallback: T,
  isValid: (v: string) => v is T,
): T;
export function readLocalPreference<T extends string>(
  storage: Pick<PrefStorage, "getItem">,
  key: string,
  fallback: T,
  isValid?: (v: string) => v is T,
): T | string {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    // localStorage indisponibil (sandbox, storage blocat) — fallback sigur.
    return fallback;
  }
  if (raw === null) return fallback;
  if (isValid && !isValid(raw)) return fallback;
  return raw as T;
}

/**
 * Scrie o preferință ca string brut. Returnează `true` dacă scrierea a reușit,
 * `false` dacă storage-ul a aruncat (fără să propage excepția). Hook-ul folosește
 * rezultatul ca să decidă dacă dispatch-uiește `StorageEvent`.
 */
export function writeLocalPreference(
  storage: Pick<PrefStorage, "setItem">,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Storage indisponibil — nu putem persista; renunțăm fără crash.
    return false;
  }
}
