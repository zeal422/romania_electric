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
 * - "day": începutul zilei calendaristice (00:00 local).
 */
export function bucketKey(ts: number, granularity: Granularity): number {
  const d = new Date(ts);
  switch (granularity) {
    case "raw":
    case "10m": {
      const minutes = d.getMinutes();
      const bucketStartMin = Math.floor(minutes / 10) * 10;
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        bucketStartMin,
        0,
        0,
      ).getTime();
    }
    case "hour":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0).getTime();
    case "day":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
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
      };
      for (const f of FIELDS) {
        (point[f] as number) = r1(r[f]);
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
    };
    for (const f of FIELDS) {
      (point[f] as number) = r1(b.sums[f] / b.count);
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
