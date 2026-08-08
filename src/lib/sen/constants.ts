import type { SourceField } from "./types";

/**
 * Metadate pentru sursele de producție: etichete românești, culori semantice
 * și clasificare (fossil vs regenerabil). Culorile sunt alese pentru a transmite
 * intuitiv natura sursei (cărbune = gri întunecat, gaz = portocaliu flacără,
 * ape = cyan, nuclear = lime, eolian = teal, foto = galben solar, biomasă = verde).
 */
export interface SourceMeta {
  field: SourceField;
  /** Etichetă scurtă afișată în legende și KPI-uri. */
  label: string;
  /** Denumirea completă. */
  full: string;
  /** Culoare hex folosită în grafice (consistentă între light/dark). */
  color: string;
  /** Culoare pentru fundaluri semi-transparente (fill aria). */
  fill: string;
  /** Clasificare pentru grupări (fossil / regenerabil). */
  kind: "fossil" | "renewable";
  /** Descriere scurtă, pentru tooltip-uri și accesibilitate. */
  hint: string;
}

export const SOURCES: Record<SourceField, SourceMeta> = {
  carbune: {
    field: "carbune",
    label: "Cărbune",
    full: "Cărbune și lignit",
    color: "#64748b", // slate-500
    fill: "rgba(100,116,139,0.65)",
    kind: "fossil",
    hint: "Centrale termoelectrice pe cărbune/lignit",
  },
  hidrocarburi: {
    field: "hidrocarburi",
    label: "Hidrocarburi",
    full: "Hidrocarburi (gaz)",
    color: "#ea580c", // orange-600
    fill: "rgba(234,88,12,0.65)",
    kind: "fossil",
    hint: "Centrale pe gaze naturale / hidrocarburi",
  },
  ape: {
    field: "ape",
    label: "Ape",
    full: "Hidroenergetice (ape)",
    color: "#0891b2", // cyan-600
    fill: "rgba(8,145,178,0.6)",
    kind: "renewable",
    hint: "Hidrocentrale (ape curgătoare și acumulări)",
  },
  nuclear: {
    field: "nuclear",
    label: "Nuclear",
    full: "Energie nucleară",
    color: "#84cc16", // lime-500
    fill: "rgba(132,204,22,0.6)",
    kind: "renewable",
    hint: "Centrala nuclearoelectrică Cernavodă",
  },
  eolian: {
    field: "eolian",
    label: "Eolian",
    full: "Parcuri eoliene",
    color: "#14b8a6", // teal-500
    fill: "rgba(20,184,166,0.6)",
    kind: "renewable",
    hint: "Producție din parcuri eoliene",
  },
  foto: {
    field: "foto",
    label: "Foto",
    full: "Fotovoltaice",
    color: "#eab308", // yellow-500
    fill: "rgba(234,179,8,0.6)",
    kind: "renewable",
    hint: "Panouri fotovoltaice (solar)",
  },
  biomasa: {
    field: "biomasa",
    label: "Biomasă",
    full: "Biomasă și biogaz",
    color: "#16a34a", // green-600
    fill: "rgba(22,163,74,0.6)",
    kind: "renewable",
    hint: "Centrale pe biomasă/biogaz",
  },
};

/** Ordinea de afișare a surselor (fossil jos, regenerabil sus pentru stacked area). */
export const SOURCE_ORDER: SourceField[] = [
  "carbune",
  "hidrocarburi",
  "nuclear",
  "ape",
  "biomasa",
  "eolian",
  "foto",
];

/** Câmpuri considerate regenerabile (ape + nuclear + eolian + foto + biomasă). */
export const RENEWABLE_FIELDS: SourceField[] = ["ape", "nuclear", "eolian", "foto", "biomasa"];

/** Câmpuri considerate fosile (cărbune + hidrocarburi). */
export const FOSSIL_FIELDS: SourceField[] = ["carbune", "hidrocarburi"];

/** Culori pentru serii non-sursă (consum, producție, sold). */
export const SERIES_COLORS = {
  consum: "#dc2626", // red-600
  productie: "#059669", // emerald-600
  medieConsum: "#7c3aed", // violet-600
  soldPositive: "#16a34a", // green-600 (export)
  soldNegative: "#dc2626", // red-600 (import)
} as const;

export const READING_FIELDS = [
  "consum",
  "medieConsum",
  "productie",
  "carbune",
  "hidrocarburi",
  "ape",
  "nuclear",
  "eolian",
  "foto",
  "biomasa",
  "sold",
] as const;

export type ReadingField = (typeof READING_FIELDS)[number];

export interface ReadingFieldMeta {
  field: ReadingField;
  label: string;
  color: string;
  unit: string;
}

export const READING_META: Record<ReadingField, ReadingFieldMeta> = {
  consum: { field: "consum", label: "Consum", color: SERIES_COLORS.consum, unit: "MW" },
  medieConsum: {
    field: "medieConsum",
    label: "Media consum",
    color: SERIES_COLORS.medieConsum,
    unit: "MW",
  },
  productie: {
    field: "productie",
    label: "Producție",
    color: SERIES_COLORS.productie,
    unit: "MW",
  },
  carbune: { field: "carbune", label: "Cărbune", color: SOURCES.carbune.color, unit: "MW" },
  hidrocarburi: {
    field: "hidrocarburi",
    label: "Hidrocarburi",
    color: SOURCES.hidrocarburi.color,
    unit: "MW",
  },
  ape: { field: "ape", label: "Ape", color: SOURCES.ape.color, unit: "MW" },
  nuclear: { field: "nuclear", label: "Nuclear", color: SOURCES.nuclear.color, unit: "MW" },
  eolian: { field: "eolian", label: "Eolian", color: SOURCES.eolian.color, unit: "MW" },
  foto: { field: "foto", label: "Foto", color: SOURCES.foto.color, unit: "MW" },
  biomasa: { field: "biomasa", label: "Biomasă", color: SOURCES.biomasa.color, unit: "MW" },
  sold: { field: "sold", label: "Sold", color: SERIES_COLORS.soldPositive, unit: "MW" },
};
