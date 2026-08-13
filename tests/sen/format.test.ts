import { describe, expect, it } from "bun:test";

import {
  dataAgeMs,
  formatAxisTick,
  formatDate,
  formatDateTime,
  formatLastUpdatedLabel,
  formatMW,
  formatNumber,
  formatPercent,
  formatRelative,
  formatSigned,
  formatSold,
  formatTime,
  granularityLabel,
  mwToGwh,
} from "@/lib/sen/format";

describe("formatNumber", () => {
  // ro-RO folosește '.' ca separator de mii și ',' ca separator zecimal.
  // Ex: 5932 -> "5.932", 1234.5 -> "1.234,5"
  const digits = (s: string) => s.replace(/[.\s]/g, "");

  it("formats thousands with Romanian separators", () => {
    const out = formatNumber(5932);
    expect(digits(out)).toBe("5932");
    expect(out).toContain(".");
  });

  it("respects decimals", () => {
    expect(digits(formatNumber(1234.5, 1))).toBe("1234,5");
    expect(formatNumber(1234.5, 1)).toContain(",");
  });

  it("returns dash for non-finite", () => {
    expect(formatNumber(NaN)).toBe("—");
    expect(formatNumber(Infinity)).toBe("—");
  });
});

describe("formatMW", () => {
  it("appends MW unit", () => {
    expect(formatMW(5932)).toMatch(/MW$/);
  });
});

describe("formatSigned", () => {
  it("uses + for positive", () => {
    expect(formatSigned(500).replace(/\s/g, "")).toBe("+500");
  });
  it("uses − (minus) for negative", () => {
    expect(formatSigned(-500).replace(/\s/g, "")).toMatch(/−?500/);
  });
  it("returns 0 for zero without sign", () => {
    expect(formatSigned(0).replace(/\s/g, "")).toBe("0");
  });
});

describe("formatSold", () => {
  it("labels positive as import (SOLD = CONS − PROD, sold > 0 = import net)", () => {
    const r = formatSold(1042);
    expect(r.label).toBe("Import");
    expect(r.sign).toBe("pos");
  });
  it("labels negative as export (absolute value)", () => {
    const r = formatSold(-755);
    expect(r.label).toBe("Export");
    expect(r.sign).toBe("neg");
  });
  it("labels zero as equilibrium", () => {
    const r = formatSold(0);
    expect(r.label).toBe("Echilibru");
    expect(r.sign).toBe("zero");
  });
});

describe("formatPercent", () => {
  it("appends % sign", () => {
    expect(formatPercent(68.3)).toMatch(/%$/);
    expect(formatPercent(68.3).replace(/\s/g, "")).toBe("68,3%");
  });
});

describe("mwToGwh", () => {
  it("converts MW over hours to GWh", () => {
    // 1000 MW timp de 10 ore = 10.000 MWh = 10 GWh
    expect(mwToGwh(1000, 10)).toBe(10);
  });
});

describe("formatDateTime", () => {
  it("formats as 'day month, HH:MM' without year", () => {
    const iso = "2026-08-08T18:07:57.000Z";
    const out = formatDateTime(iso);
    // conține ora 18:07
    expect(out).toContain("18:07");
    // nu conține anul 2026 fără withYear
    expect(out).not.toContain("2026");
  });

  it("includes year when withYear option is set", () => {
    const iso = "2026-08-08T18:07:57.000Z";
    const out = formatDateTime(iso, { withYear: true });
    expect(out).toContain("2026");
  });

  it("is independent of the system timezone (UTC getters)", () => {
    // Contract de timp: cifrele din sursă (18:07) trebuie să apară identic
    // indiferent de TZ-ul unde rulează testele (ex: EEST ar da 21:07 cu getters locale).
    const iso = "2026-08-08T18:07:57.000Z";
    expect(formatDateTime(iso)).toBe("8 aug, 18:07");
    expect(formatDate(iso)).toBe("8 aug 2026");
    expect(formatTime(iso)).toBe("18:07");
  });
});

describe("formatTime", () => {
  it("formats HH:MM", () => {
    const iso = "2026-08-08T09:05:00.000Z";
    expect(formatTime(iso)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatRelative", () => {
  // Contract fake-UTC: eticheta ISO e wall-clock RO etichetat UTC. În vară (EEST),
  // instanța UTC reală a lui "2026-08-08T10:00:00.000Z" e 07:00 UTC — deci baza de
  // referință pentru bucket-uri e eticheta − 3h (candidatul self-consistent).
  const iso = "2026-08-08T10:00:00.000Z";
  const resolved = Date.parse(iso) - 3 * 3600_000; // 07:00 UTC

  it("returns 'acum câteva secunde' under a minute", () => {
    // 10s rotunjit = 0 min; la 30s funcția dă deja „acum 1 min" (Math.round) — comportament intenționat.
    expect(formatRelative(iso, resolved + 10_000)).toBe("acum câteva secunde");
    expect(formatRelative(iso, resolved + 30_000)).toBe("acum 1 min");
  });

  it("returns minutes", () => {
    expect(formatRelative(iso, resolved + 10 * 60_000)).toBe("acum 10 min");
  });

  it("returns singular and plural hours", () => {
    expect(formatRelative(iso, resolved + 60 * 60_000)).toBe("acum 1 oră");
    expect(formatRelative(iso, resolved + 3 * 60 * 60_000)).toBe("acum 3 ore");
  });

  it("returns singular and plural days", () => {
    expect(formatRelative(iso, resolved + 24 * 60 * 60_000)).toBe("acum 1 zi");
    expect(formatRelative(iso, resolved + 5 * 24 * 60 * 60_000)).toBe("acum 5 zile");
  });

  it("resolves fake-UTC Bucharest wall-clock timestamps to the real instant", () => {
    // În vară, ora 10:00 locală RO e etichetată 10:00Z. Timpul real UTC e 07:00Z.
    // La 07:05:00 UTC (ora 10:05 locală), vârsta reală e 5 min.
    expect(formatRelative(iso, Date.UTC(2026, 7, 8, 7, 5, 0))).toBe("acum 5 min");
  });

  it("resolves October DST fall-back timestamps to the real instant (off by 1h on old code)", () => {
    // 25 oct 2026: DST se termină la 01:00 UTC. Eticheta 01:30Z = wall-clock 01:30 RO
    // în EEST → instanța reală 22:30 UTC (24 oct). La now 02:30 UTC, vârsta e 4h.
    expect(formatRelative("2026-10-25T01:30:00.000Z", Date.parse("2026-10-25T02:30:00.000Z"))).toBe(
      "acum 4 ore",
    );
  });

  it("resolves the ambiguous fall-back hour to the latest instant not after now", () => {
    // Eticheta 03:30Z pe 25 oct corespunde la 2 instanțe (03:30 EEST = 00:30 UTC;
    // 03:30 EET = 01:30 UTC). La now 01:00:30 UTC doar prima e în trecut → 30.5 min.
    expect(formatRelative("2026-10-25T03:30:00.000Z", Date.parse("2026-10-25T01:00:30.000Z"))).toBe(
      "acum 31 min",
    );
  });

  it("resolves March DST spring-forward timestamps to the real instant", () => {
    // 29 mar 2026: DST începe la 01:00 UTC. Eticheta 01:30Z = wall-clock 01:30 RO
    // în EET → instanța reală 23:30 UTC (28 mar). La now 02:30 UTC, vârsta e 3h.
    expect(formatRelative("2026-03-29T01:30:00.000Z", Date.parse("2026-03-29T02:30:00.000Z"))).toBe(
      "acum 3 ore",
    );
  });
});

describe("dataAgeMs", () => {
  // Contract fake-UTC: eticheta ISO e wall-clock RO etichetat UTC. În vară (EEST),
  // instanța UTC reală a lui "2026-08-08T10:00:00.000Z" e 07:00 UTC.
  const iso = "2026-08-08T10:00:00.000Z";
  const resolved = Date.parse(iso) - 3 * 3600_000; // 07:00 UTC

  it("returns the real age in ms (fake-UTC offset applied)", () => {
    expect(dataAgeMs(iso, resolved)).toBe(0);
    expect(dataAgeMs(iso, resolved + 5 * 60_000)).toBe(5 * 60_000);
    expect(dataAgeMs(iso, resolved + 2 * 3600_000)).toBe(2 * 3600_000);
  });

  it("is negative for future timestamps (no candidate in the past)", () => {
    // Niciun candidat real (eticheta −2h/−3h) nu e ≤ now → fallback pe eticheta însăși;
    // rezultatul e negativ (semnul contează: înregistrare în viitor → nu e „veche").
    expect(dataAgeMs(iso, resolved - 60_000)).toBeLessThan(0);
  });

  it("matches formatRelative bucket boundaries (DST fall-back)", () => {
    // Aceeași instanță ca testul DST din formatRelative: eticheta 01:30Z pe 25 oct
    // = wall-clock 01:30 RO în EEST → real 22:30 UTC (24 oct). La now 02:30 UTC → 4h.
    const now = Date.parse("2026-10-25T02:30:00.000Z");
    expect(dataAgeMs("2026-10-25T01:30:00.000Z", now)).toBe(4 * 3600_000);
  });

  it("resolves the ambiguous fall-back hour to the latest instant not after now", () => {
    // Eticheta 03:30Z pe 25 oct corespunde la 2 instanțe; la now 01:00:30 UTC doar
    // prima (00:30 UTC) e în trecut → vârsta 30.5 min.
    const now = Date.parse("2026-10-25T01:00:30.000Z");
    expect(dataAgeMs("2026-10-25T03:30:00.000Z", now)).toBe(30 * 60_000 + 30_000);
  });

  it("resolves March DST spring-forward timestamps (same as formatRelative)", () => {
    const now = Date.parse("2026-03-29T02:30:00.000Z");
    expect(dataAgeMs("2026-03-29T01:30:00.000Z", now)).toBe(3 * 3600_000);
  });
});

describe("formatAxisTick", () => {
  const ts = Date.UTC(2026, 7, 8, 18, 7, 57); // 8 aug 2026, 18:07 UTC

  it("day and hour show 'day month' with UTC getters", () => {
    expect(formatAxisTick(ts, "day")).toBe("8 aug");
    expect(formatAxisTick(ts, "hour")).toBe("8 aug");
  });

  it("raw and 10m show HH:MM", () => {
    expect(formatAxisTick(ts, "raw")).toBe("18:07");
    expect(formatAxisTick(ts, "10m")).toBe("18:07");
  });

  it("is independent of the system timezone", () => {
    // Pe un sistem EEST, getters locale ar da 21:07 — nu și cu formatAxisTick (UTC).
    expect(formatAxisTick(ts, "10m")).toBe("18:07");
  });
});

describe("formatLastUpdatedLabel", () => {
  it("uses feminine agreement with diacritics", () => {
    expect(formatLastUpdatedLabel("acum 10 min")).toBe(
      "Ultima înregistrare, actualizată acum 10 min",
    );
  });

  it("returns the base label without trailing whitespace for empty relative", () => {
    expect(formatLastUpdatedLabel("")).toBe("Ultima înregistrare, actualizată");
  });
});

describe("granularityLabel", () => {
  it("maps known granularities to Romanian labels", () => {
    expect(granularityLabel("raw")).toBe("Date brute (10 min)");
    expect(granularityLabel("10m")).toBe("10 minute");
    expect(granularityLabel("hour")).toBe("Orar");
    expect(granularityLabel("day")).toBe("Zilnic");
  });
  it("returns the input for unknown values", () => {
    expect(granularityLabel("foo")).toBe("foo");
  });
});
