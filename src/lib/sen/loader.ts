import { promises as fs } from "node:fs";
import path from "node:path";

import type { SenReading, SenSummaryResponse } from "./types";

/**
 * Loader pentru datele SEN. Citește fișierul JSON generat din xlsx
 * (vezi scripts/convert-sen.py) și îl ține în memorie pe durata vieții
 * procesului server (cache singleton). Datele sunt sortate crescător după ts.
 *
 * Atent: acest modul rulează DOAR pe server (folosește node:fs). Nu importa
 * în cod de client.
 */

const DATA_PATH = path.join(process.cwd(), "data", "sen-data.json");
const SUMMARY_PATH = path.join(process.cwd(), "data", "sen-summary.json");

let dataCache: SenReading[] | null = null;
let summaryCache: SenSummaryResponse | null = null;
let loadPromise: Promise<SenReading[]> | null = null;

/** Încarcă și parsează datele brute (sortate crescător după ts). Cache singleton. */
export async function loadReadings(): Promise<SenReading[]> {
  if (dataCache) return dataCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SenReading[];
    parsed.sort((a, b) => a.ts - b.ts);
    dataCache = parsed;
    return parsed;
  })();
  return loadPromise;
}

/** Încarcă summary-ul precalculat. Cache singleton. */
export async function loadSummary(): Promise<SenSummaryResponse> {
  if (summaryCache) return summaryCache;
  const raw = await fs.readFile(SUMMARY_PATH, "utf-8");
  summaryCache = JSON.parse(raw) as SenSummaryResponse;
  return summaryCache;
}

/** Sincron: returnează datele dacă sunt deja încărcate, altfel null. */
export function getCachedReadings(): SenReading[] | null {
  return dataCache;
}

/** Invalidare cache (folosit în teste). */
export function resetCache(): void {
  dataCache = null;
  summaryCache = null;
  loadPromise = null;
}
