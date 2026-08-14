import { describe, expect, it } from "bun:test";

import { buildLegendRows, SOURCE_ORDER, SOURCES } from "@/lib/sen/constants";
import type { SenReading } from "@/lib/sen/types";

function makeReading(overrides: Partial<SenReading> = {}): SenReading {
  return {
    t: "2026-08-14T12:00:00.000Z",
    ts: 1_786_708_800_000,
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

describe("buildLegendRows", () => {
  it("afișează mereu toate cele 7 surse, chiar când una e la 0 (regresia vechiului filtru > 0)", () => {
    const rows = buildLegendRows(makeReading({ foto: 0 }));

    // Vechiul cod (.filter((d) => d.value > 0)) dădea 6 rânduri când foto = 0.
    expect(rows).toHaveLength(7);

    const foto = rows.find((r) => r.field === "foto");
    expect(foto?.value).toBe(0);
    expect(foto?.isZero).toBe(true);
  });

  it("marchează isZero: false când sursa produce (foto = 120)", () => {
    const rows = buildLegendRows(makeReading({ foto: 120 }));

    const foto = rows.find((r) => r.field === "foto");
    expect(foto?.value).toBe(120);
    expect(foto?.isZero).toBe(false);
  });

  it("fără latest întoarce 7 rânduri cu value 0 și isZero true (empty-state, nu rânduri gri cu valori false)", () => {
    const rows = buildLegendRows(undefined);

    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.value).toBe(0);
      expect(row.isZero).toBe(true);
    }
  });

  it("păstrează ordinea SOURCE_ORDER (fosil jos → regenerabil sus)", () => {
    const rows = buildLegendRows(makeReading());

    expect(rows.map((r) => r.field)).toEqual(SOURCE_ORDER);
    expect(rows).toHaveLength(SOURCE_ORDER.length);
  });

  it("fiecare rând preia label/color/hint din SOURCES (single source of truth, regula 4.5)", () => {
    const rows = buildLegendRows(makeReading());

    for (const row of rows) {
      expect(row.label).toBe(SOURCES[row.field].label);
      expect(row.color).toBe(SOURCES[row.field].color);
      expect(row.hint).toBe(SOURCES[row.field].hint);
    }
  });
});
