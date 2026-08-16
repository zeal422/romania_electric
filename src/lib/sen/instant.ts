/**
 * Valori INSTANT („real-time”) de la Transelectrica — server-only.
 *
 * Sursa: endpoint-ul `/sen-filter` (JSON cu coduri SEN → valori), EXACT
 * endpoint-ul pe care site-ul oficial îl poll-uiește la fiecare 10 secunde
 * pentru bara „Consum / Producție / Sold” (descoperit prin investigație în
 * JS-ul oficial: `setTimeout("STATE_SEN_Q()", 10000)`). Seria istorică
 * (`sen-grafic`, ~10 min) rămâne în `live.ts` — aici e doar snapshot-ul
 * curent, pentru KPI-uri, mixul curent și badge-ul de prospețime.
 *
 * Payload-ul e o listă de obiecte cu o singură cheie (cod SEN → valoare):
 *   [{"KOZL115":"176"},{"CONS":"4506"},{"PROD":"5007"},{"SOLD":"-501"},...,
 *    {"row1_HARTASEN_DATA":"26/8/13 15:12:27"}]
 * Codurile SEN: CONS, PROD, SOLD, CARB, GAZE, APE, NUCL, EOLIAN, FOTO, BMASA
 * (+ ISPOZ pentru stocare — preluat separat de `storage.ts`).
 *
 * Acest modul:
 *  - parsează payload-ul (coduri SEN → câmpurile interne, aceleași nume ca
 *    `SenReading`) cu invariant anti-shift `sold == consum − productie`;
 *  - la runtime întreabă `/sen-filter` (TTL scurt + backoff + inflight
 *    partajat), cu fallback silențios: la eșec returnează `null`, iar UI-ul
 *    folosește ultima înregistrare din seria istorică (`summary.latest`).
 *
 * Contract de timp (identic cu live.ts): timestamp-ul din payload
 * (`row1_HARTASEN_DATA`, format `YY/MM/DD HH:MM:SS`) e wall-clock România
 * etichetat UTC.
 *
 * NU importă cod client — folosește doar `fetch` (server runtime).
 * Nu-l importa în componente client.
 */

import { LIVE_STALE_THRESHOLD_MS } from "./constants";
import { dataAgeMs } from "./format";
import type { InstantData } from "./types";

/** Endpoint-ul public Transelectrica pentru valorile instant (folosit și de site-ul lor). */
export const INSTANT_URL = "https://www.transelectrica.ro/sen-filter";

// TTL-uri/backoff (regula §4.5: rămân în modulul server-only, NU în constants.ts).
const INSTANT_TTL_MS = 10_000; // site-ul oficial poll-uiește la 10s; noi cache-uim 10s
const FETCH_TIMEOUT_MS = 8_000; // endpoint rapid (e poll-uit la 10s de ei)
const FETCH_RETRIES = 1;
const FETCH_RETRY_DELAY_MS = 500;
const FETCH_FAIL_TTL_MS = 30_000; // backoff la eșec: nu relovim endpoint-ul timp de 30s

/**
 * Toleranța invariantului anti-shift (MW): `sold` trebuie să fie ~`consum −
 * productie` (pe sursa oficială sunt EGALI, verificat pe payload real: CONS
 * 4506 − PROD 5007 = SOLD −501). Abatere mai mare = coloane shiftate (bug-ul
 * clasic de august 2026, când ordinea de la endpoint s-a schimbat) → payload
 * neîncrezător. Toleranța mică acoperă rotunjiri / valori marcate „*”.
 */
const INSTANT_SOLD_TOLERANCE_MW = 5;

/** Maparea codurilor SEN din /sen-filter la câmpurile interne (ca SenReading). */
const SEN_FILTER_FIELDS: Record<string, keyof Omit<InstantData, "t" | "ts">> = {
  CONS: "consum",
  PROD: "productie",
  SOLD: "sold",
  CARB: "carbune",
  GAZE: "hidrocarburi",
  APE: "ape",
  NUCL: "nuclear",
  EOLIAN: "eolian",
  FOTO: "foto",
  BMASA: "biomasa",
};

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

// Regex zecimal strict (paritate cu extractIspoz din storage.ts și float() din
// Python): respinge hex/binary/octal/underscore — doar zecimale (+ exponent).
const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

// Ora/minutul/secundele pot veni cu UNA sau DOUĂ cifre (verificat pe payload
// real: „26/8/15 8:10:33” — ora 8 fără zero-padding). Range-urile sunt validate
// explicit mai jos (hh ≤ 23 etc.), deci acceptarea a 1–2 cifre e sigură.
const TS_RE = /^(\d{2})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/;

let cache: { data: InstantData; fetchedAt: number } | null = null;
let lastFailedAt = 0;
// Promise în zbor partajată: previne dublu-fetch când mai multe requesturi cad
// simultan pe cache rece (același pattern ca inflightFetch din live.ts/storage.ts).
let inflightFetch: Promise<InstantData> | null = null;

/** Invalidare cache (folosit în teste). */
export function resetInstantCache(): void {
  cache = null;
  lastFailedAt = 0;
  inflightFetch = null;
}

/**
 * Parsează timestamp-ul din `row1_HARTASEN_DATA` — format `YY/MM/DD HH:MM:SS`
 * (an din 2 cifre: 70–99 → 19xx, 0–69 → 20xx), wall-clock RO etichetat UTC.
 * Range-urile sunt validate explicit + round-trip de calendar (nu ne bazăm pe
 * normalizarea silențioasă a Date.UTC — ex: 30 feb ar deveni 2 mar).
 * Returnează null pentru input invalid.
 */
export function parseInstantTimestamp(raw: string): { t: string; ts: number } | null {
  const m = TS_RE.exec(raw.trim());
  if (!m) return null;
  const [, yy, mm, dd, hh, min, ss] = m;
  const yyNum = Number(yy);
  const mmNum = Number(mm);
  const ddNum = Number(dd);
  const hhNum = Number(hh);
  const minNum = Number(min);
  const ssNum = Number(ss);
  if (mmNum < 1 || mmNum > 12) return null;
  if (ddNum < 1 || ddNum > 31) return null;
  if (hhNum > 23 || minNum > 59 || ssNum > 59) return null;
  const yyyy = yyNum >= 70 ? 1900 + yyNum : 2000 + yyNum;
  const ts = Date.UTC(yyyy, mmNum - 1, ddNum, hhNum, minNum, ssNum);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  // Round-trip de calendar: o dată imposibilă (ex: 30 feb, 31 apr) ar fi fost
  // normalizată silențios de Date.UTC → o respingem ca input invalid.
  if (d.getUTCMonth() !== mmNum - 1 || d.getUTCDate() !== ddNum) return null;
  return { t: d.toISOString(), ts };
}

/** Număr strict (paritate cu float() din Python); null pentru input nevalid. */
function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    // Strippăm marker-ul de estimare „*” (ca în parseLiveLine din live.ts).
    const trimmed = raw.replace("*", "").trim();
    if (trimmed === "") return null;
    if (!DECIMAL_RE.test(trimmed)) return null;
    const v = Number(trimmed);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Parsează payload-ul `/sen-filter` într-un `InstantData` (sau null).
 * Cerințe: payload-ul e array; toate cele 10 coduri SEN sunt prezente și
 * numerice; timestamp-ul există și e valid; invariantul anti-shift ține.
 */
export function parseInstantPayload(payload: unknown): InstantData | null {
  if (!Array.isArray(payload)) return null;
  const map = new Map<string, unknown>();
  for (const pair of payload) {
    if (!pair || typeof pair !== "object") continue;
    const entries = Object.entries(pair as Record<string, unknown>);
    // Fiecare obiect are o singură cheie (cod SEN → valoare).
    if (entries.length === 1) map.set(entries[0][0], entries[0][1]);
  }

  const tsRaw = map.get("row1_HARTASEN_DATA");
  const tsParsed = typeof tsRaw === "string" ? parseInstantTimestamp(tsRaw) : null;
  if (!tsParsed) return null;

  const out: Record<string, unknown> = { t: tsParsed.t, ts: tsParsed.ts };
  for (const [code, field] of Object.entries(SEN_FILTER_FIELDS)) {
    const v = parseNumber(map.get(code));
    if (v === null) return null;
    out[field] = v;
  }

  const consum = out.consum as number;
  const productie = out.productie as number;
  const sold = out.sold as number;
  if (Math.abs(sold - (consum - productie)) > INSTANT_SOLD_TOLERANCE_MW) return null;

  return out as unknown as InstantData;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch live la /sen-filter; aruncă la eroare. Reîncearcă o dată (FETCH_RETRIES)
 * pe eșec TRANZITORIU (rețea/timeout/5xx); payload-ul invalid e determinist —
 * fără retry (același pattern ca fetchLiveReadings din live.ts).
 */
export async function fetchCurrentInstant(): Promise<InstantData> {
  let lastTransientErr: unknown = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(FETCH_RETRY_DELAY_MS);
    try {
      const res = await fetch(INSTANT_URL, {
        headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status >= 500) {
        lastTransientErr = new Error(`Transelectrica sen-filter HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        // Non-5xx (4xx etc.) = determinist — marcat non-retryable, re-aruncat în catch
        // (același pattern ca fetchLiveReadings din live.ts, fix 0.3.24).
        const err = new Error(`Transelectrica sen-filter HTTP ${res.status}`) as Error & {
          retryable: false;
        };
        err.retryable = false;
        throw err;
      }
      const payload: unknown = await res.json();
      const data = parseInstantPayload(payload);
      if (!data) throw new Error("Transelectrica sen-filter: payload invalid");
      return data;
    } catch (err) {
      // Payload invalid (determinist) și erorile HTTP non-5xx (marcate `retryable: false`)
      // se re-aruncă imediat, fără retry. Doar eșecurile tranzitorii (rețea/timeout/5xx)
      // primesc a doua încercare.
      if (err instanceof Error && /payload invalid/.test(err.message)) throw err;
      if (err instanceof Error && (err as { retryable?: boolean }).retryable === false) throw err;
      lastTransientErr = err;
    }
  }
  throw lastTransientErr instanceof Error ? lastTransientErr : new Error(String(lastTransientErr));
}

/**
 * Un snapshot e „proaspăt” dacă vârsta lui reală (contract fake-UTC, prin
 * `dataAgeMs`) nu depășește pragul de prospețime din UI. Pură, testabilă —
 * `now` e obligatoriu (regula §4.2).
 */
export function isInstantFresh(data: InstantData, now: number): boolean {
  return dataAgeMs(data.t, now) <= LIVE_STALE_THRESHOLD_MS;
}

/** Cache-ul stale e acceptabil doar dacă snapshot-ul e încă proaspăt. */
function staleCacheOrNull(now: number): InstantData | null {
  return cache && isInstantFresh(cache.data, now) ? cache.data : null;
}

/**
 * Snapshot-ul instant curent (cache TTL 10s + backoff + inflight partajat),
 * sau `null` la eșec/stale — UI-ul cade pe `summary.latest`. Nu aruncă.
 */
export async function getInstantData(): Promise<InstantData | null> {
  const now = Date.now();
  const fresh = cache && now - cache.fetchedAt < INSTANT_TTL_MS;
  if (fresh && cache) return cache.data;

  const inBackoff = now - lastFailedAt < FETCH_FAIL_TTL_MS;
  if (inBackoff) return staleCacheOrNull(now);

  if (!inflightFetch) {
    inflightFetch = fetchCurrentInstant().finally(() => {
      inflightFetch = null;
    });
  }
  try {
    const data = await inflightFetch;
    // Momentul REAL de după fetch (leția TO_FIX F3 din storage.ts): `now`-ul
    // de mai sus e capturat înainte de await — fetchedAt-ul (baza TTL-ului) și
    // guard-ul de prospețime folosesc timpul de după await, nu cel pre-fetch.
    const fetchedAtReal = Date.now();
    // Guard prospețime: un snapshot vechi (ex: sen-filter servește date stale)
    // NU e „live” — îl respingem ca să nu mințim badge-ul de prospețime.
    if (!isInstantFresh(data, fetchedAtReal)) {
      lastFailedAt = fetchedAtReal;
      console.warn("[instant] snapshot-ul sen-filter e mai vechi decât pragul de prospețime");
      return staleCacheOrNull(Date.now());
    }
    cache = { data, fetchedAt: fetchedAtReal };
    return data;
  } catch (err) {
    lastFailedAt = Date.now();
    console.warn(
      `[instant] fetch sen-filter eșuat, UI-ul folosește summary.latest: ${String(err)}`,
    );
    return staleCacheOrNull(Date.now());
  }
}
