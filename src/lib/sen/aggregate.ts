import type { AggregatedPoint, Granularity, SenReading } from "./types";

/**
 * Modulul de agregare: grupează înregistrări brute (10-min) în bucket-uri
 * de timp și calculează media fiecărui câmp numeric per bucket.
 *
 * Toate funcțiile sunt pure și deterministe — ideale pentru teste unitare.
 */

const FIELDS = [
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

type NumField = (typeof FIELDS)[number];

/** Media aritmetică simplă a unui șir numeric (ignoră NaN/Infinity). */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/** Rotunjește la o zecimală (consistență cu sursa). */
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Returnează cheia de bucket (epoch ms la începutul bucket-ului) pentru un
 * timestamp dat, în funcție de granularitate.
 *
 * - "raw"/"10m": bucket de 10 minute, aliniat la minut multiplu de 10.
 * - "hour": începutul orei.
 * - "day": începutul zilei calendaristice (00:00).
 *
 * ATENȚIE (contract de timp): folosim Date.UTC + getters UTC. Datele sunt
 * wall-clock românesc etichetat UTC, iar bucket-urile trebuie să fie identice
 * pe ORICE fus orar (server). Getters locale ar muta granițele de zi/oră.
 */
export function bucketKey(ts: number, granularity: Granularity): number {
  const d = new Date(ts);
  switch (granularity) {
    case "raw":
    case "10m": {
      const minutes = d.getUTCMinutes();
      const bucketStartMin = Math.floor(minutes / 10) * 10;
      return Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        bucketStartMin,
        0,
        0,
      );
    }
    case "hour":
      return Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        0,
        0,
        0,
      );
    case "day":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
    default:
      return ts;
  }
}

/**
 * Agreghează un șir de înregistrări în bucket-uri de timp.
 *
 * @param readings înregistrări brute (de preferință sortate crescător după ts)
 * @param granularity mărimea bucket-ului
 * @returns puncte agregate, sortate crescător după ts
 */
export function aggregate(readings: SenReading[], granularity: Granularity): AggregatedPoint[] {
  if (readings.length === 0) return [];

  // Pentru "raw" returnăm fiecare înregistrare ca punct (cu count=1).
  if (granularity === "raw") {
    return readings.map((r) => {
      const point: AggregatedPoint = {
        t: r.t,
        ts: r.ts,
        count: 1,
        consum: 0,
        medieConsum: 0,
        productie: 0,
        carbune: 0,
        hidrocarburi: 0,
        ape: 0,
        nuclear: 0,
        eolian: 0,
        foto: 0,
        biomasa: 0,
        sold: 0,
      };
      for (const f of FIELDS) {
        point[f] = r1(r[f]);
      }
      return point;
    });
  }

  const buckets = new Map<number, { sums: Record<NumField, number>; count: number }>();

  for (const r of readings) {
    const key = bucketKey(r.ts, granularity);
    let bucket = buckets.get(key);
    if (!bucket) {
      const sums = {} as Record<NumField, number>;
      for (const f of FIELDS) sums[f] = 0;
      bucket = { sums, count: 0 };
      buckets.set(key, bucket);
    }
    for (const f of FIELDS) {
      bucket.sums[f] += r[f];
    }
    bucket.count += 1;
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return keys.map((key) => {
    const b = buckets.get(key)!;
    const point: AggregatedPoint = {
      t: new Date(key).toISOString(),
      ts: key,
      count: b.count,
      consum: 0,
      medieConsum: 0,
      productie: 0,
      carbune: 0,
      hidrocarburi: 0,
      ape: 0,
      nuclear: 0,
      eolian: 0,
      foto: 0,
      biomasa: 0,
      sold: 0,
    };
    for (const f of FIELDS) {
      point[f] = r1(b.sums[f] / b.count);
    }
    return point;
  });
}

/**
 * Filtrează înregistrările după un interval [from, to] (inclusiv, pe ts).
 * Dacă from/to sunt undefined, nu filtrează la acel capăt.
 */
export function filterByRange(readings: SenReading[], from?: number, to?: number): SenReading[] {
  return readings.filter((r) => {
    if (from !== undefined && r.ts < from) return false;
    if (to !== undefined && r.ts > to) return false;
    return true;
  });
}

/**
 * Limitează numărul de puncte la `maxPoints` prin sub-eșantionare uniformă
 * (păstrează primul și ultimul). Folosit pentru a proteja frontend-ul când
 * intervalul selectat e foarte mare la granularitate raw.
 */
export function downsample<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) return items;
  if (maxPoints <= 1) return [items[0]];
  const step = (items.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(items[Math.round(i * step)]);
  }
  return result;
}
