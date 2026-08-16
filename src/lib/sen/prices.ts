/**
 * Prețurile PZU (day-ahead) — server-only.
 *
 * Sursa: OPCOM (export CSV public, fără cheie — la fel cum Transelectrica
 * expune widget-ul SEN). Istoricul e capturat de workflow-ul `price-capture`
 * (GitHub Actions, cron zilnic) în `data/sen-prices.json` — vezi
 * scripts/convert-sen.py --capture-prices. Acest modul doar citește seria
 * capturată (cache singleton, la fel ca loader.ts / storage.ts).
 *
 * NU importă cod client — folosește doar `node:fs` (server runtime).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { PriceDay } from "./types";

const PRICES_PATH = path.join(process.cwd(), "data", "sen-prices.json");

let pricesCache: PriceDay[] | null = null;
let loadPromise: Promise<PriceDay[]> | null = null;

/** Invalidare cache (folosit în teste). */
export function resetPricesCache(): void {
  pricesCache = null;
  loadPromise = null;
}

/** Încarcă seria capturată din data/sen-prices.json (cache singleton, sortată pe dată). */
export async function loadPriceDays(): Promise<PriceDay[]> {
  if (pricesCache) return pricesCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await fs.readFile(PRICES_PATH, "utf-8");
      const parsed = JSON.parse(raw) as PriceDay[];
      parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      pricesCache = parsed;
      return parsed;
    } catch (err) {
      // Fișier lipsă/corupt (ex: deploy înainte de prima captură a workflow-ului)
      // → listă goală, NU 500: cardul de costuri afișează „prețuri indisponibile",
      // site-ul nu se rupe. NU cache-uim eșecul: fișierul poate apărea ulterior.
      console.warn(`[prices] nu pot încărca ${PRICES_PATH}: ${String(err)} — fără prețuri`);
      loadPromise = null;
      return [];
    }
  })();
  return loadPromise;
}

/** Alias descriptiv: prețurile PZU capturate (listă goală la lipsă/corupt). */
export async function getPriceDays(): Promise<PriceDay[]> {
  return loadPriceDays();
}
