import type { FieldStats, SenReading, SourceField } from "./types";
import { SOURCE_FIELDS } from "./types";
import { RENEWABLE_FIELDS } from "./constants";
import { mean } from "./aggregate";

/**
 * Calcul de statistici pe șiruri numerice. Pure și testabil.
 */

/** min/max/avg pentru un șir de numere finite. */
export function fieldStats(values: number[]): FieldStats {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }
  let min = finite[0];
  let max = finite[0];
  let sum = 0;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    avg: Math.round((sum / finite.length) * 10) / 10,
  };
}

/**
 * Share-ul regenerabil din producția totală, ca procent (0-100),
 * pentru un șir de înregistrări dat. Media ponderată pe probe.
 */
export function renewableShare(readings: SenReading[]): number {
  if (readings.length === 0) return 0;
  let renewableSum = 0;
  let prodSum = 0;
  for (const r of readings) {
    let ren = 0;
    for (const f of RENEWABLE_FIELDS) {
      ren += r[f];
    }
    renewableSum += ren;
    prodSum += r.productie;
  }
  if (prodSum === 0) return 0;
  return Math.round(((100 * renewableSum) / prodSum) * 10) / 10;
}

/** Share-ul fiecărei surse din producția medie totală. */
export function sourceShares(readings: SenReading[]): Record<SourceField, number> {
  const result = {} as Record<SourceField, number>;
  if (readings.length === 0) {
    for (const f of SOURCE_FIELDS) result[f] = 0;
    return result;
  }
  const sums: Record<SourceField, number> = {
    carbune: 0,
    hidrocarburi: 0,
    ape: 0,
    nuclear: 0,
    eolian: 0,
    foto: 0,
    biomasa: 0,
  };
  let total = 0;
  for (const r of readings) {
    for (const f of SOURCE_FIELDS) {
      sums[f] += r[f];
      total += r[f];
    }
  }
  for (const f of SOURCE_FIELDS) {
    result[f] = total === 0 ? 0 : Math.round(((100 * sums[f]) / total) * 10) / 10;
  }
  return result;
}

/**
 * Statistici balanță sold (import vs export).
 * Semantica sold (confirmată pe sursa oficială, SOLD = CONS − PROD):
 * sold > 0 = consum peste producție = IMPORT net; sold < 0 = EXPORT net.
 */
export interface BalanceStats {
  importSamples: number;
  exportSamples: number;
  importShare: number;
  avgImport: number;
  avgExport: number;
  netAvg: number;
}

export function balanceStats(soldValues: number[]): BalanceStats {
  const finite = soldValues.filter((v) => Number.isFinite(v));
  const total = finite.length;
  if (total === 0) {
    return {
      importSamples: 0,
      exportSamples: 0,
      importShare: 0,
      avgImport: 0,
      avgExport: 0,
      netAvg: 0,
    };
  }
  const imports = finite.filter((v) => v > 0);
  const exports = finite.filter((v) => v < 0);
  return {
    importSamples: imports.length,
    exportSamples: exports.length,
    importShare: Math.round(((100 * imports.length) / total) * 10) / 10,
    avgImport: Math.round(mean(imports) * 10) / 10,
    avgExport: Math.round(mean(exports) * 10) / 10,
    netAvg: Math.round(mean(finite) * 10) / 10,
  };
}

/**
 * Găsește înregistrarea cea mai recentă (după ts). Inputul poate fi nesortat.
 */
export function latestReading(readings: SenReading[]): SenReading | null {
  if (readings.length === 0) return null;
  let best = readings[0];
  for (const r of readings) {
    if (r.ts > best.ts) best = r;
  }
  return best;
}
