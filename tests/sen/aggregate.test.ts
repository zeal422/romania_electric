import { describe, expect, it } from "bun:test";

import { aggregate, bucketKey, downsample, filterByRange, mean } from "@/lib/sen/aggregate";
import type { Granularity, SenReading } from "@/lib/sen/types";

/** Helper: creează o înregistrare SenReading sintetică pentru teste. */
function makeReading(ts: number, overrides: Partial<SenReading> = {}): SenReading {
  return {
    t: new Date(ts).toISOString(),
    ts,
    consum: 1000,
    medieConsum: 1000,
    productie: 1000,
    carbune: 100,
    hidrocarburi: 100,
    ape: 200,
    nuclear: 200,
    eolian: 150,
    foto: 200,
    biomasa: 50,
    sold: 0,
    ...overrides,
  };
}

describe("mean", () => {
  it("computes arithmetic mean of finite numbers", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20])).toBe(15);
  });

  it("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });

  it("ignores non-finite values", () => {
    expect(mean([1, NaN, 3, Infinity])).toBe(2);
  });
});

describe("bucketKey", () => {
  // Contract de timp: datele sunt wall-clock românesc etichetat UTC.
  // Folosim Date.UTC peste tot ca testele să fie independente de TZ-ul mașinii.
  const base = Date.UTC(2026, 6, 8, 18, 7, 57); // 8 iul 2026, 18:07:57

  it("aligns 10m bucket to nearest 10-minute boundary", () => {
    expect(bucketKey(base, "10m")).toBe(Date.UTC(2026, 6, 8, 18, 0, 0));
    expect(bucketKey(Date.UTC(2026, 6, 8, 18, 24, 9), "10m")).toBe(Date.UTC(2026, 6, 8, 18, 20, 0));
    expect(bucketKey(Date.UTC(2026, 6, 8, 18, 59, 0), "10m")).toBe(Date.UTC(2026, 6, 8, 18, 50, 0));
  });

  it("raw behaves like 10m for bucketing", () => {
    expect(bucketKey(base, "raw")).toBe(bucketKey(base, "10m"));
  });

  it("hour bucket aligns to start of hour", () => {
    expect(bucketKey(base, "hour")).toBe(Date.UTC(2026, 6, 8, 18, 0, 0));
    expect(bucketKey(Date.UTC(2026, 6, 8, 23, 59, 59), "hour")).toBe(
      Date.UTC(2026, 6, 8, 23, 0, 0),
    );
  });

  it("day bucket aligns to UTC midnight", () => {
    expect(bucketKey(base, "day")).toBe(Date.UTC(2026, 6, 8, 0, 0, 0));
    expect(bucketKey(Date.UTC(2026, 6, 8, 23, 59, 0), "day")).toBe(Date.UTC(2026, 6, 8, 0, 0, 0));
  });

  it("is independent of the system timezone", () => {
    // 18:07 UTC trebuie să rămână 18:07 UTC indiferent de TZ-ul unde rulează testele.
    expect(bucketKey(base, "10m")).toBe(Date.UTC(2026, 6, 8, 18, 0, 0));
    expect(bucketKey(base, "day")).toBe(Date.UTC(2026, 6, 8, 0, 0, 0));
  });
});

describe("aggregate", () => {
  it("returns empty array for empty input", () => {
    expect(aggregate([], "raw")).toEqual([]);
    expect(aggregate([], "hour")).toEqual([]);
  });

  it("raw returns one point per reading with count=1", () => {
    const r1 = makeReading(1000, { consum: 5000 });
    const r2 = makeReading(2000, { consum: 6000 });
    const result = aggregate([r1, r2], "raw");
    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(1);
    expect(result[0].consum).toBe(5000);
    expect(result[1].consum).toBe(6000);
    expect(result[0].ts).toBe(1000);
  });

  it("groups 10m readings into 10-minute buckets with averaged fields", () => {
    // Două înregistrări în același bucket de 10 min (18:03 și 18:07 -> bucket 18:00).
    const t1 = Date.UTC(2026, 6, 8, 18, 3, 0);
    const t2 = Date.UTC(2026, 6, 8, 18, 7, 0);
    const r1 = makeReading(t1, { consum: 4000, productie: 3000 });
    const r2 = makeReading(t2, { consum: 6000, productie: 5000 });
    const result = aggregate([r1, r2], "10m");
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    expect(result[0].consum).toBe(5000); // (4000+6000)/2
    expect(result[0].productie).toBe(4000); // (3000+5000)/2
    expect(result[0].ts).toBe(Date.UTC(2026, 6, 8, 18, 0, 0));
  });

  it("hourly aggregates average across the whole hour", () => {
    const hour = Date.UTC(2026, 6, 8, 14, 0, 0);
    const readings = [
      makeReading(hour + 0, { consum: 3000 }),
      makeReading(hour + 5 * 60_000, { consum: 4000 }),
      makeReading(hour + 50 * 60_000, { consum: 5000 }),
    ];
    const result = aggregate(readings, "hour");
    expect(result).toHaveLength(1);
    expect(result[0].consum).toBe(4000); // (3000+4000+5000)/3
    expect(result[0].count).toBe(3);
    expect(result[0].ts).toBe(hour);
  });

  it("daily aggregates across multiple hours into one bucket", () => {
    const day = Date.UTC(2026, 6, 8, 0, 0, 0);
    const readings = [
      makeReading(day + 0, { consum: 2000 }),
      makeReading(day + 6 * 3_600_000, { consum: 4000 }),
      makeReading(day + 23 * 3_600_000, { consum: 6000 }),
    ];
    const result = aggregate(readings, "day");
    expect(result).toHaveLength(1);
    expect(result[0].consum).toBe(4000);
    expect(result[0].count).toBe(3);
  });

  it("sorts output by timestamp ascending even if input is unsorted", () => {
    const t1 = Date.UTC(2026, 6, 8, 10, 0, 0);
    const t2 = Date.UTC(2026, 6, 8, 12, 0, 0);
    const result = aggregate([makeReading(t2), makeReading(t1)], "hour");
    expect(result[0].ts).toBe(t1);
    expect(result[1].ts).toBe(t2);
  });

  it("rounds aggregated values to one decimal", () => {
    const t1 = Date.UTC(2026, 6, 8, 18, 3, 0);
    const t2 = Date.UTC(2026, 6, 8, 18, 7, 0);
    const r1 = makeReading(t1, { consum: 4001 });
    const r2 = makeReading(t2, { consum: 4002 });
    const result = aggregate([r1, r2], "10m");
    // (4001+4002)/2 = 4001.5 -> rotunjit la 4001.5
    expect(result[0].consum).toBe(4001.5);
  });
});

describe("filterByRange", () => {
  const base = Date.UTC(2026, 6, 8, 12, 0, 0);
  const readings = [
    makeReading(base - 2 * 3_600_000),
    makeReading(base - 3_600_000),
    makeReading(base),
    makeReading(base + 3_600_000),
    makeReading(base + 2 * 3_600_000),
  ];

  it("filters by both bounds inclusively", () => {
    const result = filterByRange(readings, base - 3_600_000, base + 3_600_000);
    expect(result).toHaveLength(3);
  });

  it("filters only lower bound when to is undefined", () => {
    const result = filterByRange(readings, base);
    expect(result).toHaveLength(3);
  });

  it("filters only upper bound when from is undefined", () => {
    const result = filterByRange(readings, undefined, base);
    expect(result).toHaveLength(3);
  });

  it("returns all when both bounds undefined", () => {
    expect(filterByRange(readings)).toHaveLength(readings.length);
  });

  it("returns empty when range is outside data", () => {
    expect(filterByRange(readings, base + 100 * 3_600_000)).toHaveLength(0);
  });
});

describe("downsample", () => {
  it("returns original array if under maxPoints", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(downsample(arr, 10)).toBe(arr);
  });

  it("returns exactly maxPoints, keeping first and last", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const result = downsample(arr, 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(99);
  });

  it("handles maxPoints = 1", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = downsample(arr, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(1);
  });
});

describe("aggregate granularity parity", () => {
  it("all granularities produce valid AggregatedPoint shape", () => {
    const readings = [makeReading(Date.UTC(2026, 6, 8, 12, 5, 0))];
    const granularities: Granularity[] = ["raw", "10m", "hour", "day"];
    for (const g of granularities) {
      const result = aggregate(readings, g);
      expect(result).toHaveLength(1);
      const p = result[0];
      expect(p).toHaveProperty("consum");
      expect(p).toHaveProperty("productie");
      expect(p).toHaveProperty("sold");
      expect(p).toHaveProperty("count");
      expect(typeof p.consum).toBe("number");
    }
  });
});
