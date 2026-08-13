/**
 * Stocare (ISPOZ — „Instalații de stocare”) — server-only.
 *
 * Transelectrica expune stocarea DOAR ca snapshot curent (`/sen-filter`,
 * JSON cu coduri SEN → valori), fără istoric. Istoricul se construiește de
 * noi: workflow-ul `storage-capture` (GitHub Actions, cron orar) rulează
 * `scripts/convert-sen.py --capture-storage` și acumulează puncte în
 * `data/sen-storage.json` — vezi scripts/convert-sen.py.
 *
 * Acest modul:
 *  - încarcă seria acumulată (cache singleton, la fel ca loader.ts);
 *  - la runtime, întreabă `/sen-filter` pentru valoarea curentă (TTL 10 min),
 *    cu fallback la ultima captură dacă fetch-ul eșuează — site-ul nu se rupe.
 *
 * NU importă cod client — folosește doar `fetch` (server runtime).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { bucharestOffsetMs } from "./format"; // sursa reală; live.ts doar re-exportă (0.3.19)
import type { StorageApiResponse, StorageCurrent, StoragePoint } from "./types";

/** Snapshot-ul curent public de la Transelectrica (lista de coduri SEN → MW). */
export const STORAGE_URL = "https://www.transelectrica.ro/sen-filter";

const STORAGE_PATH = path.join(process.cwd(), "data", "sen-storage.json");

// TTL pentru snapshot-ul live la /sen-filter; captura orară (workflow-ul
// storage-capture, 1/h) e independentă de acest TTL.
const STORAGE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000; // scurt: la eșec folosim fallback-ul, prospețimea nu e critică
const FETCH_FAIL_TTL_MS = 60 * 1000; // backoff la eșec: nu relovim endpoint-ul timp de 1 minut

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

let historyCache: StoragePoint[] | null = null;
let loadPromise: Promise<StoragePoint[]> | null = null;
let currentCache: { t: string; ts: number; ispoz: number; fetchedAt: number } | null = null;
let lastFailedAt = 0;
// Promise în zbor partajată: previne dublu-fetch la /sen-filter când mai multe
// requesturi cad simultan pe cache rece (același pattern ca `inflightFetch` din live.ts).
let inflightFetch: Promise<number> | null = null;

/** Invalidare cache (folosit în teste). */
export function resetStorageCache(): void {
  historyCache = null;
  loadPromise = null;
  currentCache = null;
  lastFailedAt = 0;
  inflightFetch = null;
}

/** Încarcă seria acumulată din data/sen-storage.json (cache singleton, ordonată cronologic). */
export async function loadStorageHistory(): Promise<StoragePoint[]> {
  if (historyCache) return historyCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await fs.readFile(STORAGE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as StoragePoint[];
      parsed.sort((a, b) => a.ts - b.ts);
      historyCache = parsed;
      return parsed;
    } catch (err) {
      // Fișier lipsă/corupt (ex: deploy înainte de prima captură a workflow-ului)
      // → serie goală, NU 500: site-ul nu se rupe, cardul afișează „nicio captură".
      // NU cache-uim eșecul (historyCache rămâne null + loadPromise resetat):
      // fișierul poate apărea ulterior (prima captură după deploy) și atunci
      // următorul apel îl va citi, fără restart.
      console.warn(`[storage] nu pot încărca ${STORAGE_PATH}: ${String(err)} — serie goală`);
      loadPromise = null;
      return [];
    }
  })();
  return loadPromise;
}

/**
 * Extrage ISPOZ dintr-un payload `/sen-filter`. Payload-ul e o listă de
 * obiecte {cod: valoare}: [{"KOZL115":"176"},{"ISPOZ":"30"},...].
 * Returnează null dacă lipsește sau nu e numeric.
 */
export function extractIspoz(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  for (const pair of payload) {
    if (pair && typeof pair === "object" && "ISPOZ" in pair) {
      const raw = (pair as Record<string, unknown>).ISPOZ;
      // Reject înainte de Number(raw) — consistent cu extract_ispoz din Python:
      // ""/whitespace/null/[] se convertesc la 0 prin Number(), dar float()
      // aruncă → None în Python (fix TO_FIX #8).
      if (raw === null || raw === undefined) return null;
      if (Array.isArray(raw)) return null;
      if (typeof raw === "string") {
        // Paritate cu float() din Python: respinge hex/binary/octal ("0x10",
        // "0b101", "0o17" — pe care Number() le-ar accepta: 16/5/15) și
        // underscore ("1_000" — pe care Number() îl respinge oricum: NaN) —
        // doar zecimale (+ exponent) sunt valide.
        const trimmed = raw.trim();
        if (trimmed === "") return null;
        if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return null;
      }
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0) return v;
      return null;
    }
  }
  return null;
}

/** Fetch live la /sen-filter; aruncă la eroare. Testabil prin mock global fetch. */
export async function fetchCurrentIspoz(): Promise<number> {
  const res = await fetch(STORAGE_URL, {
    headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Transelectrica sen-filter HTTP ${res.status}`);
  const payload: unknown = await res.json();
  const ispoz = extractIspoz(payload);
  if (ispoz === null) throw new Error("Transelectrica sen-filter: ISPOZ lipsă sau invalid");
  return ispoz;
}

/**
 * Alege cea mai recentă valoare cunoscută: snapshot-ul live stale (din cache,
 * chiar dacă TTL-ul a expirat) vs ultima captură din istoric. Pură, testabilă.
 */
export function pickMostRecent(
  cached: StorageCurrent | null,
  last: StorageCurrent | null,
): StorageCurrent | null {
  return (
    [cached, last].filter((x): x is StorageCurrent => x !== null).sort((a, b) => b.ts - a.ts)[0] ??
    null
  );
}

/**
 * Răspunsul complet pentru /api/sen/storage: valoarea curentă (snapshot live
 * cu TTL 10 min, fallback la ultima captură) + seria istorică acumulată.
 */
export async function getStorageData(): Promise<StorageApiResponse> {
  const history = await loadStorageHistory();
  const now = Date.now();
  const fresh = currentCache && now - currentCache.fetchedAt < STORAGE_TTL_MS;
  const inBackoff = now - lastFailedAt < FETCH_FAIL_TTL_MS;

  if (fresh && currentCache) {
    const { fetchedAt, ...current } = currentCache;
    return { current: { ...current, source: "live" as const }, history, fetchedAt };
  }

  if (!inBackoff) {
    try {
      // Un singur fetch pentru toți callerii concurenți pe cache rece.
      if (!inflightFetch) {
        inflightFetch = fetchCurrentIspoz().finally(() => {
          inflightFetch = null;
        });
      }
      const ispoz = await inflightFetch;
      // Recalculăm momentul DUPĂ fetch (fix TO_FIX F3): `now`-ul de mai sus era
      // capturat înainte de await, deci la un fetch lent (până la 5s) timestamp-ul
      // afișat și fetchedAt-ul (baza TTL-ului de 10 min) ar fi decalate cu câteva
      // secunde față de momentul real al valorii.
      const fetchedAtReal = Date.now();
      // Contract de timp (ca live.ts): wall-clock România etichetat UTC — altfel
      // cardul ar afișa ora UTC reală (15:24) lângă capturile RO (18:24).
      const t = new Date(fetchedAtReal + bucharestOffsetMs(new Date(fetchedAtReal))).toISOString();
      // Contract fake-UTC (ca live.ts și convert-sen.py): ts = epoch-ul UTC al
      // valorii t etichetate (wall-clock RO), NU instant-ul real `fetchedAtReal` — altfel
      // ts-ul ar fi cu 2-3h în urmă față de t (fix TO_FIX #6).
      currentCache = { t, ts: Date.parse(t), ispoz, fetchedAt: fetchedAtReal };
      const { fetchedAt, ...current } = currentCache;
      return { current: { ...current, source: "live" as const }, history, fetchedAt };
    } catch (err) {
      lastFailedAt = Date.now();
      console.warn(
        `[storage] fetch sen-filter eșuat, folosesc ultima valoare cunoscută: ${String(err)}`,
      );
    }
  }

  // Fallback: cel mai recent punct cunoscut — fie snapshot-ul din cache (chiar
  // dacă TTL-ul a expirat), fie ultima captură acumulată, oricare e mai nou.
  // Proveniența contează pentru UI (badge „live” vs „ultima captură”): un
  // snapshot live stale rămâne `source: "live"` cu `fetchedAt`-ul original
  // (> 0), iar un punct din istoric e `source: "capture"` cu `fetchedAt: 0`.
  const cached = currentCache
    ? {
        t: currentCache.t,
        ts: currentCache.ts,
        ispoz: currentCache.ispoz,
        source: "live" as const,
      }
    : null;
  const last =
    history.length > 0 ? { ...history[history.length - 1], source: "capture" as const } : null;
  const mostRecent = pickMostRecent(cached, last);
  return {
    current: mostRecent,
    history,
    // fetchedAt păstrează momentul real al valorii live (chiar stale):
    // pentru cache-ul vechi, timestamp-ul original; pentru punctul din istoric, 0.
    fetchedAt: mostRecent?.source === "live" && currentCache ? currentCache.fetchedAt : 0,
  };
}
