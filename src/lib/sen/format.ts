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

/** Formatează soldul: pozitiv = export, negativ = import, cu etichetă. */
export function formatSold(value: number): {
  text: string;
  label: string;
  sign: "pos" | "neg" | "zero";
} {
  if (value > 0) {
    return { text: formatNumber(value), label: "Export", sign: "pos" };
  }
  if (value < 0) {
    return { text: formatNumber(Math.abs(value)), label: "Import", sign: "neg" };
  }
  return { text: "0", label: "Echilibru", sign: "zero" };
}

/** Formatează un procent (valoare deja 0-100). */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
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

/** Etichetă relativă pentru interval: "acum 10 min", "acum 2 ore". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
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
