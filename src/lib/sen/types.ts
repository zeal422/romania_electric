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
  /** Soldul energetic: pozitiv = export, negativ = import. */
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

/** Răspunsul endpoint-ului /api/sen/summary. */
export interface SenSummaryResponse {
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
    avgImport: number;
    avgExport: number;
    netAvg: number;
  };
}
