/**
 * Logica pură a rândurilor de tooltip (fără DOM/Recharts) — extrasă din
 * `ChartTooltip` (componenta păstrează doar randarea). Testabilă fără RTL,
 * model `buildLegendRows` din constants.ts.
 *
 * Motivație: filtrarea rândurilor din tooltip a avut 2 bug-uri reale —
 * (1) seriile de fill pentru gradient (balanța: `soldImport`/`soldExport`,
 * clamate la 0 pe semnul opus) apăreau ca rânduri „Import"/„Export" cu aceeași
 * valoare ca „Sold net", sau ca zerouri constante; (2) `tooltipType="none"`
 * nu filtrează cu content custom în recharts 2.15. Logica asta trebuie să fie
 * testabilă ca să nu recidiveze.
 */

/** Un rând gata de afișat în tooltip. */
export interface TooltipRow {
  key: string;
  name: string;
  value: number;
  color: string;
  unit?: string;
}

/** Un element brut din payload-ul Recharts (ce ne interesează din el). */
export interface TooltipPayloadEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: unknown;
}

/** Opțiunile de filtrare (aceleași ca props-urile `ChartTooltip`). */
export interface BuildTooltipRowsOptions {
  /** Mapare cheie serie -> etichetă afișată. */
  labels?: Record<string, string>;
  /** Unitate implicită (default MW). */
  unit?: string;
  /** Exclude rândul „consum" când antetul arată deja sumarul (showTotals). */
  showTotals?: boolean;
  /** Ascunde rândurile cu valoare 0 (balanța: seriile de fill clamate). */
  hideZero?: boolean;
  /** Ascunde seriile după cheie (balanța: seriile de fill pentru gradient). */
  hideKeys?: string[];
}

/**
 * Construiește rândurile de tooltip dintr-un payload Recharts: filtrează
 * intrările nenumerice, mapează numele prin `labels`, aplică excluderile
 * (`showTotals`/`hideZero`/`hideKeys`) și sortează descrescător după valoare.
 * Pură — același output pentru același input, fără stare sau timp.
 */
export function buildTooltipRows(
  payload: TooltipPayloadEntry[] | undefined,
  options: BuildTooltipRowsOptions = {},
): TooltipRow[] {
  const { labels, unit = "MW", showTotals = false, hideZero = false, hideKeys } = options;
  if (!payload || payload.length === 0) return [];

  return payload
    .filter((p) => typeof p.value === "number")
    .map((p) => {
      const key = String(p.dataKey ?? p.name);
      const name = labels?.[key] ?? (typeof p.name === "string" ? p.name : key);
      return {
        key,
        name,
        value: p.value as number,
        color: (typeof p.color === "string" ? p.color : undefined) ?? "var(--primary)",
        unit,
      };
    })
    .filter((r) => !(showTotals && r.key === "consum"))
    .filter((r) => !(hideZero && r.value === 0))
    .filter((r) => !(hideKeys && hideKeys.includes(r.key)))
    .sort((a, b) => b.value - a.value);
}
