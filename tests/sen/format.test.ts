import { describe, expect, it } from "bun:test";

import { toLocalDateKey } from "@/lib/sen/calendar";
import {
  customRangeToBoundaries,
  dataAgeMs,
  formatAxisTick,
  formatDate,
  formatDateTime,
  formatLastUpdatedLabel,
  formatMW,
  formatNumber,
  formatPercent,
  formatRangeLabel,
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

describe("formatRangeLabel", () => {
  const day = 24 * 3_600_000;

  it("formats a multi-day range as 'd1–d2 month'", () => {
    // 8 aug 00:00 UTC → 15 aug 00:00 UTC (7 zile)
    const from = Date.UTC(2026, 7, 8, 0, 0, 0);
    expect(formatRangeLabel(from, from + 7 * day)).toBe("8–15 aug 2026");
  });

  it("formats a sub-day range with times", () => {
    // 8 aug 18:07 UTC → 9 aug 06:07 UTC (< 24h, zile diferite)
    const from = Date.UTC(2026, 7, 8, 18, 7, 0);
    expect(formatRangeLabel(from, from + 12 * 3_600_000)).toBe("8 aug 18:07 – 9 aug 06:07");
  });

  it("formats a same-day sub-day range with only times on the right", () => {
    const from = Date.UTC(2026, 7, 8, 0, 0, 0);
    expect(formatRangeLabel(from, from + 6 * 3_600_000)).toBe("8 aug 00:00 – 06:00");
  });

  it("is independent of the system timezone (UTC getters)", () => {
    const from = Date.UTC(2026, 7, 8, 0, 0, 0);
    expect(formatRangeLabel(from, from + 7 * day)).toBe("8–15 aug 2026");
  });
});

describe("customRangeToBoundaries (interval personalizat → granițe UTC clampate)", () => {
  // Datele disponibile: 1 iul – 15 aug 2026 (ca summary real).
  const startTs = Date.UTC(2026, 6, 1, 0, 0, 0);
  const endTs = Date.UTC(2026, 7, 15, 23, 59, 59, 999);

  it("ziua aleasă = zi întreagă în granițe UTC (00:00 → 23:59:59.999)", () => {
    const r = customRangeToBoundaries({ from: "2026-08-10", to: "2026-08-14" }, startTs, endTs);
    expect(r).toEqual({
      from: Date.UTC(2026, 7, 10, 0, 0, 0),
      to: Date.UTC(2026, 7, 14, 23, 59, 59, 999),
    });
  });

  it("clamp la datele disponibile (start/end ale seriei)", () => {
    const r = customRangeToBoundaries({ from: "2026-06-01", to: "2026-09-30" }, startTs, endTs);
    expect(r).toEqual({ from: startTs, to: endTs });
  });

  it("null pentru undefined / date invalide / from > to", () => {
    expect(customRangeToBoundaries(undefined, startTs, endTs)).toBeNull();
    expect(
      customRangeToBoundaries({ from: "garbage", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
    expect(
      customRangeToBoundaries({ from: "2026-08-14", to: "2026-08-10" }, startTs, endTs),
    ).toBeNull();
  });

  it("zi de o singură zi: from = to (00:00 → 23:59:59.999)", () => {
    const r = customRangeToBoundaries({ from: "2026-08-12", to: "2026-08-12" }, startTs, endTs);
    expect(r!.from).toBe(Date.UTC(2026, 7, 12, 0, 0, 0));
    expect(r!.to).toBe(Date.UTC(2026, 7, 12, 23, 59, 59, 999));
  });

  it("null pentru dată inexistentă (2026-02-30 se normalizează la 2 mar în V8/JSC)", () => {
    // Cu to: "2026-03-01" testul ar trece DIN GREȘEALĂ pe codul nemodificat
    // (rolled-over from = 2 mar > to = 1 mar → null accidental). Cu
    // to: "2026-03-05" codul vechi întoarce interval inversat non-null →
    // testul eșuează întâi corect (§4.14).
    expect(
      customRangeToBoundaries({ from: "2026-02-30", to: "2026-03-05" }, startTs, endTs),
    ).toBeNull();
    // Luna invalidă e respinsă de regex/round-trip, nu doar de Number.isFinite.
    expect(
      customRangeToBoundaries({ from: "2026-13-01", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
  });

  it("null când range-ul e integral înaintea seriei (după clamp, from > to)", () => {
    // Seria începe pe 1 iul: 1–5 mai e complet în afara ei. Codul vechi
    // clamp-a la [startTs, 5 mai] → interval inversat non-null (bug).
    expect(
      customRangeToBoundaries({ from: "2026-05-01", to: "2026-05-05" }, startTs, endTs),
    ).toBeNull();
  });

  it("null când range-ul e integral după serie (după clamp, from > to)", () => {
    // Seria se termină pe 15 aug: 1–5 sep e complet în afara ei.
    expect(
      customRangeToBoundaries({ from: "2026-09-01", to: "2026-09-05" }, startTs, endTs),
    ).toBeNull();
  });

  // ── Teste de CARACTERIZARE pentru parseIsoDate (fix 0.3.27) ──────────────
  // Comportamentul e deja corect în cod (verificat empiric) — acestea fixează
  // contractul, NU sunt teste de regresie (§4.14 se aplică regresiei: trec pe
  // codul actual). `to` e fixat în serie (2026-08-14): dacă `from` ar fi
  // ACCEPTAT de parse, intervalul ar fi clampat la startTs → non-null; null
  // DOVEDEȘTE reject-ul la parse (nu clamp-ul).

  it("caracterizare: ziua 00 (2026-01-00) e respinsă la parse", () => {
    // Date.UTC(2026, 0, 0) = 31 dec 2025 — round-trip (getUTCDate() = 31 ≠ 0)
    // respinge, în loc să accepte silențios ziua inexistentă.
    expect(
      customRangeToBoundaries({ from: "2026-01-00", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
  });

  it("caracterizare: luna cu 30 de zile respinge ziua 31 (round-trip)", () => {
    // Date.UTC(2026, 3, 31) = 1 mai și Date.UTC(2026, 5, 31) = 1 iul — dacă
    // n-ar fi prinse de round-trip, s-ar normaliza silențios la luna următoare.
    expect(
      customRangeToBoundaries({ from: "2026-04-31", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
    expect(
      customRangeToBoundaries({ from: "2026-06-31", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
  });

  it("caracterizare: an bisect — 2024-02-29 acceptat, 2026-02-29 respins", () => {
    // 2024 e bisect (29 feb real) → parse OK → clamp la startTs (seria începe
    // 1 iul 2026). 2026 nu e bisect → Date.UTC(2026, 1, 29) = 1 mar → respins.
    const ok = customRangeToBoundaries({ from: "2024-02-29", to: "2026-08-14" }, startTs, endTs);
    expect(ok).not.toBeNull();
    expect(ok!.from).toBe(startTs); // clampat la începutul seriei
    expect(
      customRangeToBoundaries({ from: "2026-02-29", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
  });

  it("caracterizare: an < 100 e respins sigur (Date.UTC special-case 0-99)", () => {
    // Date.UTC(99, …) = 1999 (spec: anii 0-99 = 1900+an) → round-trip eșuează
    // → respingere SIGURĂ (null), fără risc de date greșite. Irelevant pentru
    // datele aplicației (2026), dar contractul e fixat explicit.
    expect(
      customRangeToBoundaries({ from: "0099-01-01", to: "2026-08-14" }, startTs, endTs),
    ).toBeNull();
  });
});

describe("toLocalDateKey", () => {
  it("redă ziua calendaristică LOCALĂ (nu ziua UTC) — fix off-by-one UTC+3", () => {
    // react-day-picker produce miezul nopții LOCAL al zilei click-uite. Pentru
    // un browser UTC+3 (România — publicul țintă), click-ul pe „15 aug" creează
    // un Date = 14 aug 21:00 UTC, iar toISOString().slice(0,10) ar da
    // „2026-08-14" (ziua greșită — off-by-one). Getters-ii locali redau mereu
    // ziua pe care utilizatorul a văzut-o în calendar, în orice fus.
    const sel = new Date(2026, 7, 15, 0, 0, 0); // click pe „15 aug" (local midnight)
    expect(toLocalDateKey(sel)).toBe("2026-08-15");
  });

  it("completează cu zero ziua și luna cu o singură cifră", () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 0, 0, 0))).toBe("2026-01-05");
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
