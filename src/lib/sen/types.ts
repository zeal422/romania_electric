/**
 * Tipuri de date pentru Sistemul Energetic Național (SEN).
 * Datele provin din fișierul Transelectrica (Grafic_SEN.xlsx).
 */

/** O înregistrare brută la intervale de ~10 minute, așa cum apare în fișierul sursă. */
export interface SenReading {
  /** ISO timestamp (wall-clock așa cum a fost înregistrat de Transelectrica). */
  t: string;
  /** Epoch milliseconds, folosit pentru sortare și filtrare. */
  ts: number;
  consum: number;
  medieConsum: number;
  productie: number;
  carbune: number;
  hidrocarburi: number;
  ape: number;
  nuclear: number;
  eolian: number;
  foto: number;
  biomasa: number;
  /** Soldul energetic (SOLD = CONS − PROD): pozitiv = import, negativ = export. */
  sold: number;
}

/** Cheile câmpurilor numerice din SenReading (în afară de t/ts). */
export type SenField = keyof Omit<SenReading, "t" | "ts">;

/** Sursele de producție, în ordinea canonică de afișare. */
export const SOURCE_FIELDS = [
  "carbune",
  "hidrocarburi",
  "ape",
  "nuclear",
  "eolian",
  "foto",
  "biomasa",
] as const;

export type SourceField = (typeof SOURCE_FIELDS)[number];

/** Granularitatea de agregare cerută prin API. */
export type Granularity = "raw" | "10m" | "hour" | "day";

/** Lista canonică a granularităților (single source of truth pentru UI + validare). */
export const GRANULARITIES: Granularity[] = ["raw", "10m", "hour", "day"];

/**
 * Granularitățile compatibile cu un preset de interval (sursă unică pentru UI
 * și pentru normalizarea din page.tsx). Regula: 24h e prea scurt pentru `day`;
 * 30d/all e prea dens pentru `raw`/`10m`. Trăiește lângă `GRANULARITIES` (nu
 * în filters.tsx) ca logica pură să fie testabilă fără a importa un component
 * client. Depinde doar de string-urile de preset, nu de RANGE_PRESETS.
 */
export function granularitiesForPreset(preset: string): Granularity[] {
  if (preset === "24h") return GRANULARITIES.filter((g) => g !== "day");
  if (preset === "30d" || preset === "all") {
    return GRANULARITIES.filter((g) => g !== "raw" && g !== "10m");
  }
  return GRANULARITIES;
}

/** Un punct agregat pe un bucket de timp. */
export interface AggregatedPoint {
  /** ISO timestamp la începutul bucket-ului. */
  t: string;
  /** Epoch ms la începutul bucket-ului. */
  ts: number;
  /** Media consumului în bucket (sau valoarea unică dacă raw). */
  consum: number;
  medieConsum: number;
  productie: number;
  carbune: number;
  hidrocarburi: number;
  ape: number;
  nuclear: number;
  eolian: number;
  foto: number;
  biomasa: number;
  sold: number;
  /** Numărul de înregistrări brute incluse în bucket. */
  count: number;
}

/** Statistici simple pe un șir de numere. */
export interface FieldStats {
  min: number;
  max: number;
  avg: number;
}

/** Răspunsul endpoint-ului /api/sen. */
export interface SenApiResponse {
  range: { from: string; to: string };
  granularity: Granularity;
  points: AggregatedPoint[];
  summary: {
    count: number;
    consum: FieldStats;
    productie: FieldStats;
    sold: FieldStats;
    renewableShareAvg: number;
  };
}

/** Un punct de captură a stocării (ISPOZ), acumulat de workflow-ul storage-capture. */
export interface StoragePoint {
  /** ISO timestamp al capturii (wall-clock RO etichetat UTC, la nivel de secundă). */
  t: string;
  /** Epoch milliseconds, folosit pentru sortare și filtrare. */
  ts: number;
  /** Stocarea curentă în MW („Instalații de stocare” — ISPOZ, valoare numerică ≥ 0). */
  ispoz: number;
}

/** Valoarea curentă de stocare (snapshot live sau punct din istoric). */
export interface StorageCurrent {
  t: string;
  ts: number;
  ispoz: number;
  /**
   * Proveniența valorii:
   * - `"live"` — snapshot de la `/sen-filter` (proaspăt în TTL sau stale din cache);
   * - `"capture"` — ultimul punct din istoricul acumulat (fallback pur).
   * UI-ul etichetează badge-ul după această proveniență („live" vs „ultima captură").
   */
  source: "live" | "capture";
}

/** Răspunsul endpoint-ului /api/sen/storage. */
export interface StorageApiResponse {
  /** Valoarea curentă: snapshot live (dacă fetch-ul a reușit) sau ultima captură. */
  current: StorageCurrent | null;
  /** Seria completă acumulată (de la prima captură, ordonată cronologic). */
  history: StoragePoint[];
  /**
   * Epoch ms când a fost obținut `current` din live (0 dacă valoarea vine din
   * istoric — `source: "capture"`). Un snapshot live stale (cache expirat)
   * păstrează `fetchedAt`-ul original > 0 cu `source: "live"`.
   */
  fetchedAt: number;
}

/** Răspunsul endpoint-ului /api/sen/summary. */
export interface SenSummaryResponse {
  /**
   * Numărul de înregistrări EXPUS (static + citiri live mai noi, dacă există).
   * Poate depăși populația pe care s-au calculat `stats`/`balance`/`renewableShareAvg`,
   * care rămân cele precalculate pe tot istoricul static — e intenționat (live-ul
   * aduce doar câteva puncte recente; mediile globale nu trebuie să „sară” la fiecare refresh).
   */
  count: number;
  start: string;
  end: string;
  startTs: number;
  endTs: number;
  latest: SenReading;
  stats: Record<SenField, FieldStats>;
  sources: SourceField[];
  renewableShareAvg: number;
  balance: {
    importSamples: number;
    exportSamples: number;
    importShare: number;
    /** Media soldurilor din probele de IMPORT (sold > 0) — valoare POZITIVĂ (ex: 1041.8). */
    avgImport: number;
    /** Media soldurilor din probele de EXPORT (sold < 0) — valoare NEGATIVĂ (ex: -751.6). */
    avgExport: number;
    netAvg: number;
  };
}
