import { describe, expect, it } from "bun:test";

import {
  balanceStats,
  fieldStats,
  latestReading,
  renewableShare,
  sourceShares,
} from "@/lib/sen/stats";
import type { SenReading } from "@/lib/sen/types";

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

describe("fieldStats", () => {
  it("computes min, max, avg", () => {
    const s = fieldStats([10, 20, 30, 40, 50]);
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.avg).toBe(30);
  });

  it("returns zeros for empty input", () => {
    expect(fieldStats([])).toEqual({ min: 0, max: 0, avg: 0 });
  });

  it("ignores non-finite values", () => {
    const s = fieldStats([10, NaN, 20, Infinity]);
    expect(s.min).toBe(10);
    expect(s.max).toBe(20);
    expect(s.avg).toBe(15);
  });

  it("rounds to one decimal", () => {
    const s = fieldStats([1, 2]);
    expect(s.avg).toBe(1.5);
  });
});

describe("renewableShare", () => {
  it("returns 0 for empty input", () => {
    expect(renewableShare([])).toBe(0);
  });

  it("returns 0 when production is zero", () => {
    const r = makeReading(0, {
      productie: 0,
      carbune: 0,
      hidrocarburi: 0,
      ape: 0,
      nuclear: 0,
      eolian: 0,
      foto: 0,
      biomasa: 0,
    });
    expect(renewableShare([r])).toBe(0);
  });

  it("computes weighted renewable share across samples", () => {
    // productie 1000, renewable (ape+eolian+foto+biomasa, FĂRĂ nuclear) = 200+150+200+50 = 600
    // -> 60% (nuclearul NU e regenerabil și nu se numără)
    const r = makeReading(0);
    expect(renewableShare([r])).toBe(60);
  });

  it("does not count nuclear generation as renewable", () => {
    // Doar nuclear + productie: share-ul regenerabil trebuie să fie 0.
    const r = makeReading(0, {
      productie: 1000,
      carbune: 0,
      hidrocarburi: 0,
      ape: 0,
      nuclear: 1000,
      eolian: 0,
      foto: 0,
      biomasa: 0,
    });
    expect(renewableShare([r])).toBe(0);
  });

  it("averages correctly across multiple readings", () => {
    const r1 = makeReading(0, {
      productie: 1000,
      ape: 500,
      nuclear: 0,
      eolian: 0,
      foto: 0,
      biomasa: 0,
    }); // 50%
    const r2 = makeReading(1, {
      productie: 1000,
      ape: 0,
      nuclear: 0,
      eolian: 0,
      foto: 500,
      biomasa: 0,
    }); // 50%
    // renewable total = 500 + 500 = 1000, prod total = 2000 -> 50%
    expect(renewableShare([r1, r2])).toBe(50);
  });
});

describe("sourceShares", () => {
  it("returns 0 for all sources on empty input", () => {
    const s = sourceShares([]);
    expect(s.carbune).toBe(0);
    expect(s.eolian).toBe(0);
  });

  it("computes percentage of each source in total production mix", () => {
    const r = makeReading(0); // carbune100, hc100, ape200, nuclear200, eolian150, foto200, biomasa50 = total 1000
    const s = sourceShares([r]);
    expect(s.carbune).toBe(10);
    expect(s.hidrocarburi).toBe(10);
    expect(s.ape).toBe(20);
    expect(s.nuclear).toBe(20);
    expect(s.eolian).toBe(15);
    expect(s.foto).toBe(20);
    expect(s.biomasa).toBe(5);
    // Sumează la 100
    const total = s.carbune + s.hidrocarburi + s.ape + s.nuclear + s.eolian + s.foto + s.biomasa;
    expect(total).toBeCloseTo(100, 0);
  });
});

describe("balanceStats", () => {
  it("returns zeros for empty input", () => {
    const b = balanceStats([]);
    expect(b.importSamples).toBe(0);
    expect(b.exportSamples).toBe(0);
    expect(b.importShare).toBe(0);
  });

  it("splits positive/negative sold values (positive = import, negative = export)", () => {
    const b = balanceStats([100, -200, 300, -100, 0]);
    expect(b.importSamples).toBe(2); // 100, 300
    expect(b.exportSamples).toBe(2); // -200, -100
    expect(b.importShare).toBe(40); // 2 of 5
  });

  it("computes average import/export and net", () => {
    const b = balanceStats([1000, -500, 2000]);
    // imports = [1000, 2000], exports = [-500]
    expect(b.avgImport).toBe(1500);
    expect(b.avgExport).toBe(-500);
    // net = mean([1000,-500,2000]) = 833.33 -> 833.3
    expect(b.netAvg).toBe(833.3);
  });
});

describe("latestReading", () => {
  it("returns null for empty input", () => {
    expect(latestReading([])).toBeNull();
  });

  it("finds the reading with max ts even if unsorted", () => {
    const r1 = makeReading(100);
    const r2 = makeReading(500);
    const r3 = makeReading(300);
    expect(latestReading([r1, r2, r3])?.ts).toBe(500);
  });
});
