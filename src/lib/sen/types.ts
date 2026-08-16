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

/**
 * Snapshot-ul INSTANT („real-time”) al SEN, de la endpoint-ul `/sen-filter` al
 * Transelectrica — aceleași valori pe care site-ul oficial le afișează în bara
 * „Consum / Producție / Sold” (poll-uite de ei la fiecare 10 secunde).
 *
 * Câmpurile au aceleași nume ca `SenReading` (maparea codurilor SEN → câmpuri
 * interne e în `instant.ts`), dar vin dintr-un payload separat, la granularitate
 * de secunde — NU din seria istorică `sen-grafic` (~10 min).
 */
export interface InstantData {
  /** ISO timestamp din payload (wall-clock RO etichetat UTC, secundă). */
  t: string;
  /** Epoch ms (Date.parse(t)) — contract fake-UTC, ca SenReading. */
  ts: number;
  consum: number;
  productie: number;
  sold: number;
  carbune: number;
  hidrocarburi: number;
  ape: number;
  nuclear: number;
  eolian: number;
  foto: number;
  biomasa: number;
}

/**
 * Prețurile PZU (day-ahead) pentru o zi de livrare, capturate de workflow-ul
 * `price-capture` de pe OPCOM (export CSV public, fără cheie).
 *
 * Contract de timp: `date` e ziua calendaristică wall-clock România
 * (YYYY-MM-DD), iar `prices[i]` e prețul mediu al intervalului de livrare
 * `i+1` (adică ora wall-clock RO `i:00–i+1:00`) în EUR/MWh. Numărul de
 * intervale e 24 în zilele normale, 23 la trecerea la ora de vară (ora
 * 02:00–03:00 nu există) și 25 la trecerea la ora de iarnă (ora 02:00–03:00
 * apare de două ori) — alinierea se face prin `getUTCHours` (contract
 * fake-UTC, vezi format.ts/aggregate.ts), fără conversii EET/EEST.
 */
export interface PriceDay {
  /** Ziua calendaristică de livrare (wall-clock RO), YYYY-MM-DD. */
  date: string;
  /** Prețurile orare PZU în EUR/MWh (index i = intervalul de livrare i+1). */
  prices: number[];
  /** Moneda prețurilor — mereu "EUR" (sursa OPCOM e în Euro/MWh). */
  currency: "EUR";
}

/** Sumarul costurilor import/export pentru un interval selectat. */
export interface CostsSummary {
  /** Energia importată (sold > 0) în MWh, pe orele cu preț disponibil. */
  importMWh: number;
  /** Energia exportată (sold < 0) în MWh, pe orele cu preț disponibil. */
  exportMWh: number;
  /** Costul estimat al importului în EUR (Σ importMWh × preț PZU orar). */
  cost: number;
  /** Venitul estimat din export în EUR (Σ exportMWh × preț PZU orar). */
  revenue: number;
  /** Soldul net: cost − venit (pozitiv = plătim net, negativ = încasăm net). */
  net: number;
  /** Orele intervalului acoperite de prețuri (față de total). */
  coveredHours: number;
  /** Numărul total de ore din interval (inclusiv cele fără preț). */
  totalHours: number;
  /** True dacă cel puțin o oră are preț disponibil (altfel costul e 0 fără sens). */
  hasPrices: boolean;
}

/** Răspunsul endpoint-ului /api/sen/costs. */
export interface CostsApiResponse {
  range: { from: string; to: string };
  /** Sumarul costurilor pe intervalul selectat („—" la zero fără prețuri). */
  costs: CostsSummary;
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
