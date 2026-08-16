/**
 * Helperi de formatare pentru afișarea datelor SEN.
 * Toate funcțiile sunt pure și testabile unitar.
 * Formatarea folosește Intl cu locale ro-RO pentru a respecta convenția românească
 * (spațiu ca separator de mii, virgulă ca separator zecimal).
 */

import type { Granularity } from "./types";

const RO = "ro-RO";

/**
 * Label de axă X pentru graficele Recharts, adaptat la granularitate.
 * Folosește UTC (contract de timp): cifrele din sursă apar identic pe orice fus.
 * - day/hour → "8 aug"
 * - raw/10m  → "18:07"
 */
export function formatAxisTick(ts: number, granularity: Granularity): string {
  const d = new Date(ts);
  if (granularity === "day" || granularity === "hour") {
    const month = d.toLocaleString(RO, { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
    return `${d.getUTCDate()} ${month}`;
  }
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Formatează un număr cu separator de mii (fără zecimale implicit). */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(RO, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Formatează o valoare în MW, ex: "5 932 MW". */
export function formatMW(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)} MW`;
}

/** Formatează o valoare cu semn explicit (pentru sold: +/−). */
export function formatSigned(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), decimals)}`;
}

/**
 * Formatează soldul. Semantica (confirmată pe sursa oficială: SOLD = CONSUM − PRODUCȚIE,
 * ex: CONS 4595 − PROD 5657 = −1062 = SOLD): sold > 0 = consum peste producție = IMPORT net,
 * sold < 0 = producție peste consum = EXPORT net.
 *
 * NOTĂ `sign`: invers față de anii anteriori — `pos` (sold > 0) înseamnă acum IMPORT,
 * `neg` (sold < 0) înseamnă EXPORT. Nu presupune „pos = export” folosind `sign`;
 * testează direct `value > 0`/`value < 0` sau citește `label`.
 */
export function formatSold(value: number): {
  text: string;
  label: string;
  sign: "pos" | "neg" | "zero";
} {
  if (value > 0) {
    return { text: formatNumber(value), label: "Import", sign: "pos" };
  }
  if (value < 0) {
    return { text: formatNumber(Math.abs(value)), label: "Export", sign: "neg" };
  }
  return { text: "0", label: "Echilibru", sign: "zero" };
}

/** Formatează un procent (valoare deja 0-100). */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
}

/**
 * Formatează o sumă în EUR ca milioane, ex: "1,24 mil €" (valoare negativă →
 * prefix „−"). Folosit de cardul de costuri (prețurile PZU sunt în EUR/MWh).
 */
export function formatEurMillions(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value) / 1_000_000, decimals)} mil €`;
}

/**
 * Interval personalizat (calendar range) → granițe epoch, clampate la datele
 * disponibile. Ziua aleasă = zi întreagă în granițe UTC (contract fake-UTC):
 * `from` = 00:00:00.000 al zilei de start, `to` = 23:59:59.999 al zilei de
 * final, ambele strânse în [startTs, endTs]. Returnează null pentru input
 * invalid (date lipsă/invalide sau from > to) — apelantul cade pe preset.
 *
 * Extrasă din page.tsx (fix: logica de granițe UTC era închisă în componentă,
 * netestabilă). Pură și deterministă (AGENTS §4.2) — testabilă unitar.
 */
export function customRangeToBoundaries(
  customRange: { from: string; to: string } | undefined,
  startTs: number,
  endTs: number,
): { from: number; to: number } | null {
  if (!customRange) return null;
  const fromIso = new Date(`${customRange.from}T00:00:00.000Z`).getTime();
  const toIso = new Date(`${customRange.to}T23:59:59.999Z`).getTime();
  if (!Number.isFinite(fromIso) || !Number.isFinite(toIso) || fromIso > toIso) return null;
  return {
    from: Math.max(startTs, fromIso),
    to: Math.min(endTs, toIso),
  };
}

/**
 * Etichetă compactă de interval pentru footer-urile de card (ex: „8–15 aug”
 * pentru 7 zile, „8 aug 18:07 – 9 aug 18:07” pentru 24h). Folosește getters
 * UTC (contract fake-UTC — vezi formatDateTime): cifrele din sursă apar
 * identic pe orice fus orar.
 *
 * - interval ≥ 24h: doar data („8–15 aug”; dacă anii diferă, include anul);
 * - interval < 24h: data + ora („8 aug 18:07 – 9 aug 06:07”).
 *
 * Pură și deterministă (AGENTS §4.2) — testabilă unitar.
 */
export function formatRangeLabel(from: number, to: number): string {
  const d1 = new Date(from);
  const d2 = new Date(to);
  const month1 = d1.toLocaleString(RO, { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
  const month2 = d2.toLocaleString(RO, { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
  const day1 = d1.getUTCDate();
  const day2 = d2.getUTCDate();
  const hh1 = String(d1.getUTCHours()).padStart(2, "0");
  const mm1 = String(d1.getUTCMinutes()).padStart(2, "0");
  const hh2 = String(d2.getUTCHours()).padStart(2, "0");
  const mm2 = String(d2.getUTCMinutes()).padStart(2, "0");
  const y1 = d1.getUTCFullYear();
  const y2 = d2.getUTCFullYear();

  const sameDay = day1 === day2 && month1 === month2 && y1 === y2;
  if (to - from < 24 * 3_600_000 && sameDay) {
    return `${day1} ${month1} ${hh1}:${mm1} – ${hh2}:${mm2}`;
  }
  if (to - from < 24 * 3_600_000) {
    return `${day1} ${month1} ${hh1}:${mm1} – ${day2} ${month2} ${hh2}:${mm2}`;
  }
  if (y1 !== y2) return `${day1} ${month1} ${y1} – ${day2} ${month2} ${y2}`;
  if (month1 !== month2) return `${day1} ${month1} – ${day2} ${month2} ${y2}`;
  return `${day1}–${day2} ${month2} ${y2}`;
}

/** Formatează energy (MW) ca GWh estimat pentru o perioadă dată în ore. */
export function mwToGwh(mw: number, hours: number): number {
  return (mw * hours) / 1000;
}

/**
 * Formatează un timestamp ISO într-un label scurt de tip zi/oră,
 * ex: "8 aug, 18:07". Folosește locale ro-RO.
 *
 * ATENȚIE (contract de timp): datele din fișierul Transelectrica sunt wall-clock
 * românesc etichetat UTC (ex: `18:07` în sursă → `T18:07:57.000Z`). Le afișăm
 * fidel cu getters UTC, ca cifrele din sursă să apară identic pe ORICE fus orar
 * (server sau browser). Nu folosi getters locale — ar schimba ora afișată.
 */
export function formatDateTime(iso: string, opts?: { withYear?: boolean }): string {
  const d = new Date(iso);
  const month = d.toLocaleString(RO, { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const year = opts?.withYear ? ` ${d.getUTCFullYear()}` : "";
  return `${day} ${month}${year}, ${hh}:${mm}`;
}

/** Formatează doar data (fără oră): "8 aug 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString(RO, { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/** Formatează doar ora: "18:07". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Offset-ul UTC (ms) al orei României pentru o dată: +3h EEST (vară), +2h EET (iarnă).
 * Reguli UE: EEST începe ultima duminică din martie la 01:00 UTC și se termină
 * ultima duminică din octombrie la 01:00 UTC.
 *
 * Parametrul e obligatoriu (fără default `new Date()`) — funcția trebuie să rămână
 * pură/deterministă (AGENTS §4.2): apelanții decid instanța, nu timpul curent.
 */
export function bucharestOffsetMs(date: Date): number {
  const y = date.getUTCFullYear();
  const lastSunday = (year: number, monthIndex: number): number => {
    const last = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
    const back = last.getUTCDay(); // 0 = duminică
    return Date.UTC(year, monthIndex, last.getUTCDate() - back, 1); // 01:00 UTC
  };
  const dstStart = lastSunday(y, 2); // martie
  const dstEnd = lastSunday(y, 9); // octombrie
  const t = date.getTime();
  return t >= dstStart && t < dstEnd ? 3 * 3600_000 : 2 * 3600_000;
}

/**
 * Vârsta reală (ms) a unei înregistrări față de `now` — baza de calcul a
 * `formatRelative` și pragul de prospețime din UI.
 *
 * Contract fake-UTC: eticheta ISO e wall-clock RO etichetat UTC, deci instanța UTC
 * reală a înregistrării e `eticheta − offset RO`. Offset-ul exact (EET/EEST) depinde
 * de instanță (DST), iar la tranziții aceeași etichetă poate corespunde la 2 instanțe.
 * Candidatăm ambele offset-uri (+2h/+3h), reținem doar candidații self-consistenți
 * (`bucharestOffsetMs(candidat) === offset aplicat`) și alegem cel mai recent candidat
 * valid care nu e în viitor față de `now` — uniform în vară și iarnă, corect și la
 * tranzițiile DST (înainte: erori de 1–3h pe zilele de tranziție + vârste subestimate
 * pentru datele mai vechi de 2–3h).
 *
 * `now` e obligatoriu (fără default `Date.now()`) — funcția rămâne pură/deterministă
 * (AGENTS §4.2): apelanții decid momentul de referință (UI-ul trece `Date.now()`),
 * testele trec valori fixe.
 */
export function dataAgeMs(iso: string, now: number): number {
  const targetMs = new Date(iso).getTime();

  let resolved = targetMs;
  const candidates: number[] = [];
  for (const offsetMs of [2 * 3600_000, 3 * 3600_000]) {
    const cand = targetMs - offsetMs;
    if (bucharestOffsetMs(new Date(cand)) === offsetMs) candidates.push(cand);
  }
  const past = candidates.filter((c) => c <= now);
  if (past.length > 0) resolved = Math.max(...past);

  return now - resolved;
}

/**
 * Etichetă relativă pentru interval: "acum 10 min", "acum 2 ore".
 * Bazată pe `dataAgeMs` (aceeași rezolvare a instanței reale fake-UTC).
 * `now` e obligatoriu — vezi `dataAgeMs`.
 */
export function formatRelative(iso: string, now: number): string {
  const diffMs = dataAgeMs(iso, now);
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "acum câteva secunde";
  if (min < 60) return `acum ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `acum ${hours} ${hours === 1 ? "oră" : "ore"}`;
  const days = Math.round(hours / 24);
  return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
}

/**
 * Eticheta de accesibilitate pentru badge-ul „ultima înregistrare” din Header.
 * „Înregistrare” e feminin, deci participiul e „actualizată”.
 */
export function formatLastUpdatedLabel(relative: string): string {
  return relative
    ? `Ultima înregistrare, actualizată ${relative}`
    : "Ultima înregistrare, actualizată";
}

/** Etichetă scurtă pentru o granularitate. */
export function granularityLabel(g: string): string {
  switch (g) {
    case "raw":
      return "Date brute (10 min)";
    case "10m":
      return "10 minute";
    case "hour":
      return "Orar";
    case "day":
      return "Zilnic";
    default:
      return g;
  }
}
