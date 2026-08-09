import { describe, expect, it } from "bun:test";

import {
  formatAxisTick,
  formatDate,
  formatDateTime,
  formatLastUpdatedLabel,
  formatMW,
  formatNumber,
  formatPercent,
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
  it("labels positive as export", () => {
    const r = formatSold(1042);
    expect(r.label).toBe("Export");
    expect(r.sign).toBe("pos");
  });
  it("labels negative as import (absolute value)", () => {
    const r = formatSold(-755);
    expect(r.label).toBe("Import");
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
