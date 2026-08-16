/**
 * Costurile import/export estimate pe baza prețurilor PZU (day-ahead).
 *
 * Datele fizice (MW la ~10 min, `sold` = import/export) vin de la Transelectrica;
 * prețurile orare (EUR/MWh) vin de la OPCOM (capturate de workflow-ul
 * `price-capture` în `data/sen-prices.json`). Costul estimat = Σ (MWh × preț).
 *
 * IMPORTANT — ce e și ce nu e acoperit: prețurile PZU sunt cele fixate la
 * licitația day-ahead pentru fiecare interval de livrare. Costul REAL al
 * schimburilor include și tranzacțiile intraday și costurile de echilibrare,
 * care nu sunt publice în timp real — deci aceste calcule sunt o ESTIMARE
 * bazată pe PZU, nu costul final. UI-ul afișează explicit această etichetă.
 *
 * Toate funcțiile sunt pure și deterministe (regula 4.2): fără Date.now(),
 * fără side-effects — ideale pentru teste unitare.
 */

import type { AggregatedPoint, CostsSummary, Granularity, PriceDay } from "./types";

/**
 * Durata unui bucket în ore, pentru conversia putere (MW) → energie (MWh).
 * Contract de timp (ca bucketKey): getters UTC — bucket-urile sunt wall-clock
 * RO etichetat UTC, granițele trebuie să fie identice pe orice fus orar.
 */
export function bucketHours(ts: number, granularity: Granularity): number {
  switch (granularity) {
    case "raw":
    case "10m":
      return 10 / 60; // bucket de 10 minute
    case "hour":
      return 1;
    case "day":
      // Ziua de livrare e ~24h (23 la trecerea la ora de vară, 25 la iarnă).
      // Granularitatea "day" nu e folosită de cardul de costuri (costul se
      // calculează pe puncte orare), dar funcția rămâne corectă ca fundație.
      return 24;
    default:
      return 1;
  }
}

/**
 * Prețul PZU (EUR/MWh) pentru o oră wall-clock RO dintr-o zi de livrare.
 *
 * `hour` = 0..23 (getUTCHours al unui punct — contract fake-UTC). Indexăm
 * `prices[hour]` pentru că OPCOM pune intervalul de livrare N = ora N−1.
 * Returnează undefined dacă ziua lipsește sau ora e în afara array-ului
 * (de ex. la DST, când ziua are 23 de intervale și o oră nu există fizic).
 */
export function priceForHour(day: PriceDay | undefined, hour: number): number | undefined {
  if (!day) return undefined;
  const price = day.prices[hour];
  return typeof price === "number" && Number.isFinite(price) ? price : undefined;
}

/**
 * Calculează costurile estimate ale schimburilor pe un set de puncte agregate.
 *
 * @param points puncte agregate în intervalul selectat (de preferință orare —
 *   pentru o estimare exactă pe ore; granularitatea e folosită pentru durata
 *   bucket-ului la conversia MW → MWh)
 * @param priceDays prețurile PZU capturate, indexate pe dată (YYYY-MM-DD)
 * @returns CostsSummary — vezi types.ts. Orele fără preț sunt EXCLUSE din
 *   cost/venit, dar numărate la `totalHours`; `hasPrices` semnalează dacă
 *   există vreo oră cu preț (altfel cardul afișează „prețuri indisponibile").
 */
export function computeCosts(
  points: AggregatedPoint[],
  priceDays: PriceDay[],
  granularity: Granularity,
): CostsSummary {
  const byDate = new Map<string, PriceDay>();
  for (const d of priceDays) byDate.set(d.date, d);

  let importMWh = 0;
  let exportMWh = 0;
  let cost = 0;
  let revenue = 0;
  let coveredHours = 0;
  // Ore unice prezente în interval (cheie zi×24+ora) — `totalHours` trebuie să
  // numere ORE, nu zile. Un punct per bucket orar ⇒ fiecare punct e o oră;
  // dedup-ul protejează la granularități sub-orare (10m/raw).
  const hourKeys = new Set<number>();

  for (const p of points) {
    // Contract de timp: t e wall-clock RO etichetat UTC, deci getUTCHours +
    // getUTCDate redau exact ziua și ora din sursă (fără conversii DST).
    const d = new Date(p.ts);
    const hour = d.getUTCHours();
    const date = d.toISOString().slice(0, 10);
    const price = priceForHour(byDate.get(date), hour);
    const hours = bucketHours(p.ts, granularity);
    // Cheie UNICĂ de oră UTC: indicele global de oră (epoch / 3.6M ms). Formula
    // veche (an*10000 + lună*100 + zi*24 + oră) COLIDA la granița de lună —
    // ex: 19 iul 14:00 == 15 aug 10:00 (20261070) → totalHours subnumăra orele
    // în preset-ul de 30 de zile (verificat empiric: 100 coliziuni în 30 de zile).
    const hourKey = Math.floor(p.ts / 3_600_000);
    hourKeys.add(hourKey);

    if (price !== undefined) {
      coveredHours += 1;
      if (p.sold > 0) {
        const mwh = (p.sold * hours) / 1; // MW × h = MWh
        importMWh += mwh;
        cost += mwh * price;
      } else if (p.sold < 0) {
        const mwh = (-p.sold * hours) / 1;
        exportMWh += mwh;
        revenue += mwh * price;
      }
    }
  }

  return {
    importMWh,
    exportMWh,
    cost,
    revenue,
    net: cost - revenue,
    coveredHours,
    totalHours: hourKeys.size,
    hasPrices: coveredHours > 0,
  };
}

/** Statistici simple pe interval, pentru footer-ul „Consum vs. Producție". */
export interface IntervalStats {
  avgConsum: number;
  avgProductie: number;
  peakConsum: number;
}

/**
 * Media consumului/producției și vârful de consum pe intervalul selectat —
 * calculat din punctele agregate (deja în client), fără nevoie de prețuri.
 */
export function intervalStats(points: AggregatedPoint[]): IntervalStats {
  if (points.length === 0) {
    return { avgConsum: 0, avgProductie: 0, peakConsum: 0 };
  }
  let sumConsum = 0;
  let sumProd = 0;
  let peakConsum = -Infinity;
  for (const p of points) {
    sumConsum += p.consum;
    sumProd += p.productie;
    if (p.consum > peakConsum) peakConsum = p.consum;
  }
  return {
    avgConsum: sumConsum / points.length,
    avgProductie: sumProd / points.length,
    peakConsum,
  };
}
