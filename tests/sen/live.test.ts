import { afterEach, describe, expect, it, mock } from "bun:test";

import {
  bucharestOffsetMs,
  buildLiveUrl,
  getLiveReadings,
  getLiveSummary,
  hasSuspiciousNightSolar,
  LIVE_URL,
  mergeReadings,
  parseLiveLine,
  parseLivePayload,
  resetLiveCache,
} from "@/lib/sen/live";
import { loadSummary, resetCache } from "@/lib/sen/loader";
import type { SenReading } from "@/lib/sen/types";

// Resetăm cache-urile module-level între teste ca să nu depindă unul de altul.
afterEach(() => {
  resetLiveCache();
  resetCache();
  mock.restore();
});

describe("parseLiveLine", () => {
  it("parses a full line with 12 columns (LIVE order: sold on position 4)", () => {
    const rec = parseLiveLine(
      "09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;",
    );
    expect(rec).not.toBeNull();
    expect(rec!.t).toBe("2026-08-09T00:09:47.000Z");
    expect(rec!.consum).toBe(5435);
    expect(rec!.medieConsum).toBe(5282);
    expect(rec!.productie).toBe(6354);
    // Ordinea de la endpoint: consum;medieConsum;productie;SOLD;carbune;…;biomasa
    expect(rec!.sold).toBe(-918);
    expect(rec!.carbune).toBe(778);
    expect(rec!.hidrocarburi).toBe(1267);
    expect(rec!.ape).toBe(1113);
    expect(rec!.nuclear).toBe(680);
    expect(rec!.eolian).toBe(2435);
    expect(rec!.foto).toBe(-14);
    expect(rec!.biomasa).toBe(60);
  });

  it("matches the xlsx values for the same timestamp (18:07:57)", () => {
    // Verificat pe payload live vs. xlsx la același ts (08-08 18:07:57):
    // live: 5932;5889;6340;-407;657;1101;849;678;2263;726;57 → sold=-407, carbune=657…
    const rec = parseLiveLine(
      "08-08-2026 18:07:57;5932;5889;6340;-407;657;1101;849;678;2263;726;57;",
    );
    expect(rec).not.toBeNull();
    expect(rec!.consum).toBe(5932);
    expect(rec!.medieConsum).toBe(5889);
    expect(rec!.productie).toBe(6340);
    expect(rec!.sold).toBe(-407);
    expect(rec!.carbune).toBe(657);
    expect(rec!.hidrocarburi).toBe(1101);
    expect(rec!.ape).toBe(849);
    expect(rec!.nuclear).toBe(678);
    expect(rec!.eolian).toBe(2263);
    expect(rec!.foto).toBe(726);
    expect(rec!.biomasa).toBe(57);
  });

  it("strips estimate markers (*)", () => {
    const rec = parseLiveLine("09-08-2026 00:09:47;5435*;5282;6354;1;2;3;4;5;6;7;8;");
    expect(rec!.consum).toBe(5435);
  });

  it("returns null for invalid lines", () => {
    expect(parseLiveLine("")).toBeNull();
    expect(parseLiveLine("garbage")).toBeNull();
    expect(parseLiveLine("09-08-2026 00:09:47;5435;5282")).toBeNull(); // prea puține coloane
    expect(parseLiveLine("09-08-2026 00:09:47;abc;5282;6354;1;2;3;4;5;6;7;8;")).toBeNull();
  });

  it("keeps wall-clock digits as UTC label (time contract)", () => {
    const rec = parseLiveLine("09-08-2026 00:09:47;5435;5282;6354;1;2;3;4;5;6;7;8;");
    expect(rec!.t).toBe("2026-08-09T00:09:47.000Z");
  });
});

describe("parseLivePayload", () => {
  it("parses multiple lines separated by |", () => {
    const payload =
      "09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;|" +
      "09-08-2026 00:19:25;5322;5282;6406;-1083;782;1266;1117;682;2434;-12;61;|";
    const recs = parseLivePayload(payload);
    expect(recs).toHaveLength(2);
    expect(recs[0].ts).toBeLessThan(recs[1].ts);
    expect(recs[0].consum).toBe(5435);
    expect(recs[1].consum).toBe(5322);
  });

  it("skips empty segments and invalid rows", () => {
    const payload = "09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;||bad||";
    expect(parseLivePayload(payload)).toHaveLength(1);
  });
});

describe("mergeReadings", () => {
  const mk = (ts: number, consum: number) => ({
    t: new Date(ts).toISOString(),
    ts,
    consum,
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
  });

  it("merges static + live sorted ascending", () => {
    const merged = mergeReadings([mk(100, 1), mk(300, 3)], [mk(200, 2), mk(400, 4)]);
    expect(merged.map((r) => r.ts)).toEqual([100, 200, 300, 400]);
  });

  it("dedupes on ts with live winning", () => {
    const merged = mergeReadings([mk(100, 1), mk(200, 2)], [mk(200, 99)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.ts === 200)!.consum).toBe(99);
  });

  it("handles empty inputs", () => {
    expect(mergeReadings([], [])).toEqual([]);
    expect(mergeReadings([mk(1, 1)], [])).toHaveLength(1);
  });
});

describe("bucharestOffsetMs", () => {
  it("is +3h (EEST) in summer", () => {
    expect(bucharestOffsetMs(new Date("2026-08-09T00:00:00Z"))).toBe(3 * 3600_000);
  });

  it("is +2h (EET) in winter", () => {
    expect(bucharestOffsetMs(new Date("2026-01-15T00:00:00Z"))).toBe(2 * 3600_000);
  });

  it("switches exactly on EU DST boundaries (2026)", () => {
    // EEST începe 2026-03-29 01:00 UTC (ultima duminică din martie).
    expect(bucharestOffsetMs(new Date("2026-03-29T00:59:59Z"))).toBe(2 * 3600_000);
    expect(bucharestOffsetMs(new Date("2026-03-29T01:00:00Z"))).toBe(3 * 3600_000);
    // EEST se termină 2026-10-25 01:00 UTC (ultima duminică din octombrie).
    expect(bucharestOffsetMs(new Date("2026-10-25T00:59:59Z"))).toBe(3 * 3600_000);
    expect(bucharestOffsetMs(new Date("2026-10-25T01:00:00Z"))).toBe(2 * 3600_000);
  });
});

describe("buildLiveUrl", () => {
  it("builds the widget URL with start/end params from epoch ms", () => {
    const url = buildLiveUrl(Date.UTC(2026, 7, 9, 0, 0), Date.UTC(2026, 7, 9, 6, 30));
    expect(url).toContain(LIVE_URL);
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_start_day=09");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_start_month=08");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_start_year=2026");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_start_Hour=00");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_end_day=09");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_end_Hour=06");
    expect(url).toContain("_SENGrafic_WAR_SENGraficportlet_end_Minute=30");
  });
});

describe("getLiveReadings / getLiveSummary (fetch mock-uit)", () => {
  // Construiește un payload live relativ la ultimul ts static (endTs din repo),
  // ca testele să nu depindă de cât de noi sunt datele de pe disc.
  async function payloadNewerThanStatic(): Promise<string> {
    const { endTs } = await loadSummary();
    const fmt = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
    const t1 = new Date(endTs + 10 * 60_000); // +10 min față de static
    const t2 = new Date(endTs + 20 * 60_000); // +20 min
    return (
      `${fmt(t1)};5000;4900;6000;-100;700;1200;600;700;2300;50;60;|` +
      `${fmt(t2)};5100;5000;6100;-50;710;1210;610;710;2310;55;61;|`
    );
  }

  it("merge static + live readings and updates summary latest", async () => {
    const livePayload = await payloadNewerThanStatic();
    globalThis.fetch = mock(
      async () => new Response(livePayload, { status: 200 }),
    ) as unknown as typeof fetch;

    const readings = await getLiveReadings();
    const summary = await getLiveSummary();

    // Ultima citire live (static endTs + 20min) trebuie să fie prezentă și să devină latest.
    const last = readings[readings.length - 1];
    const { endTs } = await loadSummary();
    expect(last.ts).toBe(endTs + 20 * 60_000);
    expect(summary.latest.t).toBe(last.t);
    expect(summary.endTs).toBe(endTs + 20 * 60_000);
    expect(summary.count).toBeGreaterThan(0);
  });

  it("falls back to static data when the live fetch fails (no throw)", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const readings = await getLiveReadings();
    // Nu aruncă: întoarce datele statice, fără citirile live.
    expect(readings.length).toBeGreaterThan(0);
  });

  it("summary without newer live returns the static summary unchanged", async () => {
    // Payload live mai VECHI decât static-ul (nu aduce nimic nou).
    const oldPayload = "08-08-2026 10:00:00;3000;2900;4000;100;500;1000;500;500;1500;30;20;|";
    globalThis.fetch = mock(
      async () => new Response(oldPayload, { status: 200 }),
    ) as unknown as typeof fetch;

    const summary = await getLiveSummary();
    // latest rămâne cel static (nu există citire mai nouă).
    expect(summary.latest.t).not.toBe("2026-08-08T10:00:00.000Z");
    expect(summary.endTs).toBeGreaterThan(0);
  });
});

describe("hasSuspiciousNightSolar (guard runtime anti-shift)", () => {
  const mk = (t: string, foto: number): SenReading => ({
    t,
    ts: Date.parse(t),
    consum: 0,
    medieConsum: 0,
    productie: 0,
    carbune: 0,
    hidrocarburi: 0,
    ape: 0,
    nuclear: 0,
    eolian: 0,
    foto,
    biomasa: 0,
    sold: 0,
  });

  it("flags foto > 50 MW between 00-04h (shift symptom)", () => {
    expect(hasSuspiciousNightSolar([mk("2026-08-09T02:00:00.000Z", 1200)])).toBe(true);
  });

  it("flags foto > 50 MW at 04:30 (window is 00-06h)", () => {
    // Fereastra e 00-06h (noaptea fizică de vară), nu doar 00-04h — un shift care ar
    // pune `eolian` (~680 MW) în `foto` la 04:30 trebuie prins.
    expect(hasSuspiciousNightSolar([mk("2026-08-09T04:30:00.000Z", 700)])).toBe(true);
  });

  it("flags foto > 50 MW at 05:30 (window is 00-06h)", () => {
    expect(hasSuspiciousNightSolar([mk("2026-08-09T05:30:00.000Z", 700)])).toBe(true);
  });

  it("accepts night rows with foto ~ 0 and day rows with high foto", () => {
    expect(hasSuspiciousNightSolar([mk("2026-08-09T02:00:00.000Z", -1)])).toBe(false);
    expect(hasSuspiciousNightSolar([mk("2026-08-09T13:00:00.000Z", 2400)])).toBe(false);
  });

  it("accepts empty input", () => {
    expect(hasSuspiciousNightSolar([])).toBe(false);
  });
});

describe("loader (loadReadings / loadSummary)", () => {
  it("loads the real data files from the repo", async () => {
    const { loadReadings, loadSummary } = await import("@/lib/sen/loader");
    const [readings, summary] = await Promise.all([loadReadings(), loadSummary()]);
    expect(readings.length).toBeGreaterThan(0);
    expect(summary.count).toBe(readings.length);
    // Datele sunt sortate crescător după ts.
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i].ts).toBeGreaterThanOrEqual(readings[i - 1].ts);
    }
  });
});
