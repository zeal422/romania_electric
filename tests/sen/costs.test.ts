import { describe, expect, it } from "bun:test";

import { bucketHours, computeCosts, intervalStats, priceForHour } from "@/lib/sen/costs";
import { formatEurMillions } from "@/lib/sen/format";
import type { AggregatedPoint, PriceDay } from "@/lib/sen/types";

/**
 * Teste pentru funcțiile pure din src/lib/sen/costs.ts (costuri import/export
 * pe baza prețurilor PZU) + formatEurMillions din format.ts. Regula 4.2: orice
 * funcție nouă de calcul are test unitar; regula 4.14: testele verifică
 * invariantul (cost = Σ MWh × preț orar), nu doar „nu crapă".
 */

const DAY: PriceDay = {
  date: "2026-08-14",
  prices: [
    162.87, 152.59, 145.73, 142.05, 143.91, 154.7, 171.96, 170.08, 152.5, 116.4, 108.77, 69.88,
    33.81, 29.3, 45.77, 74.94, 116.32, 143.66, 180.51, 245.53, 261.57, 231.57, 198.0, 177.52,
  ],
  currency: "EUR",
};

/** Construiește un punct agregat minimal pe ora `hour` a lui 2026-08-14. */
function point(hour: number, sold: number, consum = 5000, productie = 5000): AggregatedPoint {
  const ts = Date.UTC(2026, 7, 14, hour, 0, 0);
  return {
    t: new Date(ts).toISOString(),
    ts,
    consum,
    productie,
    medieConsum: consum,
    carbune: 0,
    hidrocarburi: 0,
    ape: 0,
    nuclear: 0,
    eolian: 0,
    foto: 0,
    biomasa: 0,
    sold,
    count: 6,
  };
}

describe("priceForHour", () => {
  it("întoarce prețul intervalului N = ora N−1 (index 0-based)", () => {
    expect(priceForHour(DAY, 0)).toBe(162.87); // intervalul 1 = ora 00:00
    expect(priceForHour(DAY, 13)).toBe(29.3); // intervalul 14 = ora 13:00 (min)
    expect(priceForHour(DAY, 20)).toBe(261.57); // intervalul 21 = ora 20:00 (max)
    expect(priceForHour(DAY, 23)).toBe(177.52);
  });

  it("întoarce undefined la zi lipsă sau oră în afara array-ului", () => {
    expect(priceForHour(undefined, 0)).toBeUndefined();
    expect(priceForHour({ ...DAY, prices: [] }, 0)).toBeUndefined();
    // Zi cu array scurt: index în afara range-ului → undefined (fallback onest
    // la ore fără preț — de ex. ultima oră a unei zile DST cu 23 de intervale).
    const shortDay: PriceDay = {
      date: "2026-08-14",
      prices: DAY.prices.slice(0, 3),
      currency: "EUR",
    };
    expect(priceForHour(shortDay, 2)).toBe(DAY.prices[2]);
    expect(priceForHour(shortDay, 3)).toBeUndefined();
    expect(priceForHour(shortDay, 23)).toBeUndefined();
  });
});

describe("bucketHours", () => {
  it("convertește corect durata bucket-ului în ore", () => {
    expect(bucketHours(0, "hour")).toBe(1);
    expect(bucketHours(0, "10m")).toBe(10 / 60);
    expect(bucketHours(0, "raw")).toBe(10 / 60);
    expect(bucketHours(0, "day")).toBe(24);
  });
});

describe("computeCosts", () => {
  it("calculează cost = Σ importMWh × preț orar (invariantul de bază)", () => {
    // Ora 20:00: import 1000 MW × 1h = 1000 MWh × 261.57 €/MWh = 261.570 €
    const points = [point(20, 1000), point(21, -500), point(13, 200)];
    const r = computeCosts(points, [DAY], "hour");
    expect(r.importMWh).toBeCloseTo(1200, 5); // 1000 + 200
    expect(r.exportMWh).toBeCloseTo(500, 5);
    expect(r.cost).toBeCloseTo(1000 * 261.57 + 200 * 29.3, 2);
    expect(r.revenue).toBeCloseTo(500 * 231.57, 2); // ora 21 = interval 22
    expect(r.net).toBeCloseTo(r.cost - r.revenue, 2);
    expect(r.hasPrices).toBe(true);
    expect(r.coveredHours).toBe(3);
  });

  it("exclude orele fără preț din cost dar le numără la totalHours (fallback onest)", () => {
    // Zi cu doar 10 prețuri (orele 0-9): punctul de la ora 10 e fără preț → exclus
    // din cost, dar numărat la totalHours (ora există în interval, doar n-are preț).
    const shortDay: PriceDay = {
      date: "2026-08-14",
      prices: DAY.prices.slice(0, 10),
      currency: "EUR",
    };
    const r = computeCosts([point(5, 1000), point(10, 500)], [shortDay], "hour");
    expect(r.cost).toBeCloseTo(1000 * DAY.prices[5], 2); // doar ora 5 (ora 10 fără preț)
    expect(r.importMWh).toBeCloseTo(1000, 5); // MWh doar pe ora acoperită
    expect(r.coveredHours).toBe(1);
    expect(r.totalHours).toBe(2); // ambele ore există în interval, una fără preț
    expect(r.hasPrices).toBe(true);
  });

  it("totalHours numără ORE unice (nu zile) chiar și fără prețuri", () => {
    // 2 ore din aceeași zi + 1 oră din ziua următoare → 3 ore unice.
    const nextDay = new Date(Date.UTC(2026, 7, 15, 1, 0, 0));
    const p2: AggregatedPoint = {
      ...point(1, 500),
      ts: nextDay.getTime(),
      t: nextDay.toISOString(),
    };
    const r = computeCosts([point(5, 1000), point(10, 500), p2], [], "hour");
    expect(r.totalHours).toBe(3);
    expect(r.coveredHours).toBe(0);
    expect(r.hasPrices).toBe(false);
    expect(r.cost).toBe(0);
  });

  it("totalHours NU colidează la granița de lună (fix cheie oră UTC)", () => {
    // Bug real (fix 0.3.26): cheia veche an*10000 + lună*100 + zi*24 + oră colida
    // la granița de lună — 19 iul 14:00 == 15 aug 10:00 (20261070), ambele în
    // preset-ul real de 30 de zile → totalHours subnumăra. Cheia nouă
    // Math.floor(ts / 3_600_000) e unică per oră global.
    const pJul = new Date(Date.UTC(2026, 6, 19, 14, 0, 0)); // 2026-07-19 14:00
    const pAug = new Date(Date.UTC(2026, 7, 15, 10, 0, 0)); // 2026-08-15 10:00
    const pJulPoint: AggregatedPoint = {
      ...point(14, 100),
      ts: pJul.getTime(),
      t: pJul.toISOString(),
    };
    const pAugPoint: AggregatedPoint = {
      ...point(10, 200),
      ts: pAug.getTime(),
      t: pAug.toISOString(),
    };
    // Cu cheia veche, cele 2 ore colizionau → totalHours = 1 (greșit).
    const r = computeCosts([pJulPoint, pAugPoint], [], "hour");
    expect(r.totalHours).toBe(2);
    // Ora e luată din getUTCHours (nu din cheie) — prețurile rămân corecte.
    const withPrices = computeCosts(
      [pJulPoint, pAugPoint],
      [
        {
          date: "2026-07-19",
          prices: [
            50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220,
            230, 240, 250, 260, 270, 280,
          ],
          currency: "EUR",
        },
        {
          date: "2026-08-15",
          prices: [
            50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220,
            230, 240, 250, 260, 270, 280,
          ],
          currency: "EUR",
        },
      ],
      "hour",
    );
    // 100 MW × 190 (ora 14 = prices[14]) + 200 MW × 150 (ora 10 = prices[10])
    expect(withPrices.cost).toBeCloseTo(100 * 190 + 200 * 150, 2);
    expect(withPrices.totalHours).toBe(2);
  });

  it("convertește corect puterea în energie la granularitate 10m", () => {
    // Punct la 20:10 (ora 20): 600 MW × 10/60 h = 100 MWh
    const ts = Date.UTC(2026, 7, 14, 20, 10, 0);
    const p: AggregatedPoint = {
      ...point(20, 600),
      ts,
      t: new Date(ts).toISOString(),
    };
    const r = computeCosts([p], [DAY], "10m");
    expect(r.importMWh).toBeCloseTo(100, 5);
    expect(r.cost).toBeCloseTo(100 * 261.57, 2);
  });

  it("sold 0 (echilibru) nu contribuie nici la import nici la export", () => {
    const r = computeCosts([point(20, 0)], [DAY], "hour");
    expect(r.importMWh).toBe(0);
    expect(r.exportMWh).toBe(0);
    expect(r.cost).toBe(0);
    expect(r.revenue).toBe(0);
  });
});

describe("intervalStats", () => {
  it("calculează media consum/producție și vârful de consum", () => {
    const points = [point(10, 0, 6000, 4000), point(11, 0, 8000, 5000), point(12, 0, 4000, 6000)];
    const s = intervalStats(points);
    expect(s.avgConsum).toBe(6000);
    expect(s.avgProductie).toBe(5000);
    expect(s.peakConsum).toBe(8000);
  });

  it("întoarce zerouri pe interval gol (fără crash)", () => {
    const s = intervalStats([]);
    expect(s).toEqual({ avgConsum: 0, avgProductie: 0, peakConsum: 0 });
  });
});

describe("formatEurMillions", () => {
  it("formatează sume în milioane EUR cu semn", () => {
    expect(formatEurMillions(1_240_000)).toBe("1,24 mil €");
    expect(formatEurMillions(860_000)).toBe("0,86 mil €");
    expect(formatEurMillions(-3_500_000)).toBe("−3,50 mil €");
    expect(formatEurMillions(0)).toBe("0,00 mil €");
    expect(formatEurMillions(Number.NaN)).toBe("—");
  });
});
