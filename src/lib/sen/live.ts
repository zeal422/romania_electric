/**
 * Date live de la Transelectrica (server-only).
 *
 * Endpoint public folosit de widget-ul „SEN Grafic” de pe transelectrica.ro
 * (Liferay resource URL) — răspunde cu text: rânduri separate prin `|`,
 * câmpuri separate prin `;`:
 *   "09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;|..."
 * Prima coloană e timpul wall-clock România (DD-MM-YYYY HH:MM:SS), urmat de
 * cele 11 câmpuri. ATENȚIE: ordinea de la endpoint diferă de xlsx — SOLD e pe
 * poziția a 4-a (imediat după productie), NU ultima:
 *   live: consum;medieConsum;productie;SOLD;carbune;hidrocarburi;ape;nuclear;eolian;foto;biomasa
 *   xlsx: consum;medieConsum;productie;carbune;hidrocarburi;ape;nuclear;eolian;foto;biomasa;SOLD
 * (verificat pe payload live: 5435;5282;6354;-918;778;1267;1113;680;2435;-14;60 →
 *  sold=-918, carbune=778 — identic cu xlsx la același ts).
 *
 * Modulul NU importă cod client — folosește doar `fetch` (disponibil în
 * runtime-ul server). Nu-l importa în componente client.
 *
 * Comportament:
 *  - `getLiveReadings()` → datele statice + ultimele date live (cache TTL 10 min),
 *    cu fallback la datele statice dacă fetch-ul eșuează (site-ul nu se rupe).
 *  - `getLiveSummary()` → summary-ul precalculat, cu `latest`/`end`/`endTs`/`count`
 *    actualizate dacă live-ul a adus înregistrări mai noi.
 */

import { loadReadings, loadSummary } from "./loader";
import type { SenReading, SenSummaryResponse } from "./types";

/** Endpoint-ul public Transelectrica (widget „SEN Grafic”, Liferay resource URL). */
export const LIVE_URL =
  "https://www.transelectrica.ro/widget/web/tel/sen-grafic" +
  "?p_p_id=SENGrafic_WAR_SENGraficportlet" +
  "&p_p_lifecycle=2&p_p_state=maximized&p_p_mode=view";

const LIVE_TTL_MS = 10 * 60 * 1000; // 10 minute — frecvența reală a datelor sursă
const MAX_STALE_LIVE_TTL_MS = 24 * 60 * 60 * 1000; // max 24 ore pentru cache-ul live stale la eșec
const FETCH_TIMEOUT_MS = 5_000; // scurt: la eșec folosim fallback-ul static, prospețimea nu e critică
const FETCH_FAIL_TTL_MS = 60 * 1000; // backoff la eșec: nu relovim endpoint-ul timp de 1 minut
const FETCH_OVERLAP_MS = 2 * 60 * 60 * 1000; // overlap cu ultimul punct static
const MAX_BACKFILL_MS = 3 * 24 * 60 * 60 * 1000; // nu întreba mai mult de 3 zile înapoi

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

// Ordinea coloanelor de la ENDPOINT-UL LIVE (SOLD pe poziția 4 — diferă de xlsx!).
const FIELD_ORDER = [
  "consum",
  "medieConsum",
  "productie",
  "sold",
  "carbune",
  "hidrocarburi",
  "ape",
  "nuclear",
  "eolian",
  "foto",
  "biomasa",
] as const;

let liveCache: { readings: SenReading[]; fetchedAt: number } | null = null;
let lastFailedAt = 0;
// Promise în zbor partajată: previne dublu-fetch când mai multe requesturi cad
// simultan pe cache rece (ex: route.ts face Promise.all([getLiveReadings(), getLiveSummary()]),
// iar getLiveSummary() re-cheamă getLiveReadings()).
let inflightFetch: Promise<SenReading[]> | null = null;

function getValidStaleCacheReadings(now: number): SenReading[] {
  if (liveCache && now - liveCache.fetchedAt < MAX_STALE_LIVE_TTL_MS) {
    return liveCache.readings;
  }
  return [];
}

/** Invalidare cache live + backoff (folosit în teste). */
export function resetLiveCache(): void {
  liveCache = null;
  lastFailedAt = 0;
  inflightFetch = null;
}

/** Parsează o linie "DD-MM-YYYY HH:MM:SS;v1;...;v11;" într-o SenReading (null dacă invalidă). */
export function parseLiveLine(line: string): SenReading | null {
  const parts = line.trim().split(";");
  if (parts.length < 12) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(parts[0].trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  // Contract de timp: wall-clock România etichetat UTC (fără conversie EET/EEST).
  const t = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.000Z`;
  const ts = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  );
  if (!Number.isFinite(ts)) return null;

  const rec: Record<string, unknown> = { t, ts };
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    const raw = parts[i + 1]?.replace("*", "").trim();
    const v = Number(raw);
    if (raw === undefined || !Number.isFinite(v)) return null;
    rec[FIELD_ORDER[i]] = v;
  }
  return rec as unknown as SenReading;
}

/** Parsează întregul payload text de la Transelectrica într-o listă de citiri. */
export function parseLivePayload(text: string): SenReading[] {
  const out: SenReading[] = [];
  for (const line of text.split("|")) {
    if (!line.trim()) continue;
    const rec = parseLiveLine(line);
    if (rec) out.push(rec);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Merge static + live cu dedupe pe ts (live câștigă la egalitate), sortat crescător. */
export function mergeReadings(staticReadings: SenReading[], live: SenReading[]): SenReading[] {
  const byTs = new Map<number, SenReading>();
  for (const r of staticReadings) byTs.set(r.ts, r);
  for (const r of live) byTs.set(r.ts, r);
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

/**
 * Offset-ul UTC (ms) al orei României pentru o dată: +3h EEST (vară), +2h EET (iarnă).
 * Reguli UE: EEST începe ultima duminică din martie la 01:00 UTC și se termină
 * ultima duminică din octombrie la 01:00 UTC.
 */
export function bucharestOffsetMs(date: Date = new Date()): number {
  const y = date.getUTCFullYear();
  const lastSunday = (year: number, monthIndex: number): number => {
    // Ultima zi a lunii (luna următoare, ziua 0) la 12:00 UTC, apoi scădem
    // ziua săptămânii până la duminică — rezultatul e în aceeași lună (monthIndex).
    const last = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
    const back = last.getUTCDay(); // 0 = duminică
    return Date.UTC(year, monthIndex, last.getUTCDate() - back, 1); // 01:00 UTC
  };
  const dstStart = lastSunday(y, 2); // martie
  const dstEnd = lastSunday(y, 9); // octombrie
  const t = date.getTime();
  return t >= dstStart && t < dstEnd ? 3 * 3600_000 : 2 * 3600_000;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Construiește URL-ul de interogare pentru un interval [fromTs, toTs] (epoch ms). */
export function buildLiveUrl(fromTs: number, toTs: number): string {
  const f = new Date(fromTs);
  const t = new Date(toTs);
  const p: Record<string, string | number> = {
    _SENGrafic_WAR_SENGraficportlet_start_day: pad(f.getUTCDate()),
    _SENGrafic_WAR_SENGraficportlet_start_month: pad(f.getUTCMonth() + 1),
    _SENGrafic_WAR_SENGraficportlet_start_year: f.getUTCFullYear(),
    _SENGrafic_WAR_SENGraficportlet_start_Hour: pad(f.getUTCHours()),
    _SENGrafic_WAR_SENGraficportlet_start_Minute: pad(f.getUTCMinutes()),
    _SENGrafic_WAR_SENGraficportlet_end_day: pad(t.getUTCDate()),
    _SENGrafic_WAR_SENGraficportlet_end_month: pad(t.getUTCMonth() + 1),
    _SENGrafic_WAR_SENGraficportlet_end_year: t.getUTCFullYear(),
    _SENGrafic_WAR_SENGraficportlet_end_Hour: pad(t.getUTCHours()),
    _SENGrafic_WAR_SENGraficportlet_end_Minute: pad(t.getUTCMinutes()),
  };
  const qs = Object.entries(p)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${LIVE_URL}&${qs}`;
}

/**
 * Sanity-check fizic: solarul nu poate produce noaptea (00-06h ora RO, wall-clock
 * etichetat UTC). Un „foto” mare noaptea = simptom clasic de shift de coloane
 * (exact bug-ul din august 2026, când live-ul avea sold pe poziția 4, nu ultima).
 * Fereastra 00-06h acoperă noaptea fizică de vară (răsărit ~05:30-06:15 RO;
 * pe datele reale, primul `foto > 50` e la 06:13, max înainte de 06:00 = 13 MW)
 * — prinde și shift-urile din 04-06h pe care o fereastră 00-04h le rata.
 * Verifică payload-ul live înainte de merge — `getLiveReadings` face „live câștigă
 * pe dedupe”, deci un payload shiftat ar corupe silențios rândurile statice bune.
 */
export function hasSuspiciousNightSolar(readings: SenReading[]): boolean {
  for (const r of readings) {
    const h = new Date(r.ts).getUTCHours();
    if (h < 6 && r.foto > 50) return true;
  }
  return false;
}

/** Fetch live pentru intervalul [fromTs, toTs] (epoch ms). Arunca la eroare. */
export async function fetchLiveReadings(fromTs: number, toTs: number): Promise<SenReading[]> {
  const url = buildLiveUrl(fromTs, toTs);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/plain,*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Transelectrica live HTTP ${res.status}`);
  const text = await res.text();
  const readings = parseLivePayload(text);
  if (readings.length === 0) throw new Error("Transelectrica live: payload gol");
  if (hasSuspiciousNightSolar(readings)) {
    throw new Error("Transelectrica live: foto noaptea (posibil shift de coloane) — ignor payload");
  }
  return readings;
}

/**
 * Datele complete: statice + live (cache TTL). Fallback la statice dacă
 * fetch-ul eșuează — dashboard-ul rămâne funcțional oricând.
 */
export async function getLiveReadings(): Promise<SenReading[]> {
  const staticReadings = await loadReadings();
  const now = Date.now();
  const fresh = liveCache && now - liveCache.fetchedAt < LIVE_TTL_MS;
  const inBackoff = now - lastFailedAt < FETCH_FAIL_TTL_MS;
  if (fresh && liveCache) return mergeReadings(staticReadings, liveCache.readings);
  if (inBackoff) return mergeReadings(staticReadings, getValidStaleCacheReadings(now));
  // Share-uim un singur fetch pentru toți callerii concurenți (fără dublu-fetch).
  if (!inflightFetch) {
    inflightFetch = fetchLiveReadingsFromStatic(staticReadings).finally(() => {
      inflightFetch = null;
    });
  }
  const live = await inflightFetch;
  return mergeReadings(staticReadings, live);
}

async function fetchLiveReadingsFromStatic(staticReadings: SenReading[]): Promise<SenReading[]> {
  const now = Date.now();
  const lastStatic =
    staticReadings.length > 0 ? staticReadings[staticReadings.length - 1].ts : now - 24 * 3600_000;
  const from = Math.max(lastStatic - FETCH_OVERLAP_MS, now - MAX_BACKFILL_MS);
  // End-ul în ora României (offset EET/EEST), ca întrebare: datele sunt wall-clock RO.
  const to = now + bucharestOffsetMs(new Date(now));
  try {
    const readings = await fetchLiveReadings(from, to);
    liveCache = { readings, fetchedAt: now };
    return readings;
  } catch (err) {
    // Fallback silențios: folosește cache-ul live stale (dacă e < 24h) sau datele statice.
    // Ținem backoff ca un eșec de rețea să nu întârzie fiecare request cu timeout-ul.
    lastFailedAt = Date.now();
    console.warn(
      `[live] fetch Transelectrica eșuat, folosesc fallback (liveCache stale max 24h / statice): ${String(err)}`,
    );
    return getValidStaleCacheReadings(Date.now());
  }
}

/**
 * Summary-ul precalculat, cu `latest`/`end`/`endTs`/`count` actualizate dacă
 * live-ul a adus înregistrări mai noi. Statisticile globale (stats, balance,
 * renewableShareAvg) rămân cele precalculate — sunt pe tot istoricul.
 */
export async function getLiveSummary(): Promise<SenSummaryResponse> {
  const [staticSummary, readings] = await Promise.all([loadSummary(), getLiveReadings()]);
  const latest = readings[readings.length - 1];
  if (!latest || latest.ts <= staticSummary.endTs) return staticSummary;
  return {
    ...staticSummary,
    count: readings.length,
    end: latest.t,
    endTs: latest.ts,
    latest,
  };
}
