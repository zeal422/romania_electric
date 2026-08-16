import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { bucharestOffsetMs } from "@/lib/sen/format";
import {
  fetchCurrentInstant,
  getInstantData,
  isInstantFresh,
  parseInstantPayload,
  parseInstantTimestamp,
  resetInstantCache,
} from "@/lib/sen/instant";

afterEach(() => {
  resetInstantCache();
  mock.restore();
});

/** Valorile de bază ale payload-ului real /sen-filter (capturat 13 aug 2026, 15:12). */
const BASE = {
  CONS: "4506",
  PROD: "5007",
  SOLD: "-501",
  CARB: "584",
  GAZE: "1001",
  APE: "260",
  NUCL: "0",
  EOLIAN: "396",
  FOTO: "2703",
  BMASA: "54",
};

/** Construiește un payload /sen-filter (listă de obiecte cu o singură cheie). */
function payload(overrides: Record<string, unknown> = {}, ts = "26/8/13 15:12:27"): unknown[] {
  return [
    { KOZL115: "176" },
    ...Object.entries({ ...BASE, row1_HARTASEN_DATA: ts, ...overrides }).map(([k, v]) => ({
      [k]: v,
    })),
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Eticheta `YY/MM/DD HH:MM:SS` (wall-clock RO etichetat UTC, contract fake-UTC)
 * pentru o instanță REALĂ dată — aceeași convenție ca storage.ts (t = real +
 * bucharestOffsetMs). Folosită ca testele cu ceas să fie deterministe în orice
 * fus orar și la orice dată.
 */
function labelForRealInstant(realInstantMs: number): string {
  const d = new Date(realInstantMs + bucharestOffsetMs(new Date(realInstantMs)));
  return `${String(d.getUTCFullYear()).slice(2)}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

describe("parseInstantTimestamp (format YY/MM/DD HH:MM:SS)", () => {
  it("parses the real captured format (26/8/13 15:12:27)", () => {
    const r = parseInstantTimestamp("26/8/13 15:12:27");
    expect(r).not.toBeNull();
    expect(r!.t).toBe("2026-08-13T15:12:27.000Z");
    expect(r!.ts).toBe(Date.UTC(2026, 7, 13, 15, 12, 27));
  });

  it("maps two-digit years 70-99 to 19xx and 00-69 to 20xx", () => {
    expect(parseInstantTimestamp("99/12/31 23:59:59")!.t).toBe("1999-12-31T23:59:59.000Z");
    expect(parseInstantTimestamp("70/01/01 00:00:00")!.t).toBe("1970-01-01T00:00:00.000Z");
    expect(parseInstantTimestamp("69/12/31 23:59:59")!.t).toBe("2069-12-31T23:59:59.000Z");
  });

  it("accepts single-digit month/day", () => {
    expect(parseInstantTimestamp("26/8/5 09:05:00")!.t).toBe("2026-08-05T09:05:00.000Z");
  });

  it("accepts single-digit hour (real payload: '26/8/15 8:10:33')", () => {
    // Transelectrica NU face zero-padding la oră când e < 10 — payload real
    // capturat 15 aug 2026: "26/8/15 8:10:33". Fără această toleranță,
    // getInstantData → null și soldul pare „blocat” (fallback pe seria istorică).
    const r = parseInstantTimestamp("26/8/15 8:10:33");
    expect(r).not.toBeNull();
    expect(r!.t).toBe("2026-08-15T08:10:33.000Z");
    expect(r!.ts).toBe(Date.UTC(2026, 7, 15, 8, 10, 33));
  });

  it("rejects invalid formats and out-of-range components (no silent Date.UTC normalization)", () => {
    expect(parseInstantTimestamp("")).toBeNull();
    expect(parseInstantTimestamp("garbage")).toBeNull();
    expect(parseInstantTimestamp("26/13/01 00:00:00")).toBeNull(); // luna 13
    expect(parseInstantTimestamp("26/8/32 00:00:00")).toBeNull(); // ziua 32
    expect(parseInstantTimestamp("26/8/13 24:00:00")).toBeNull(); // ora 24
    expect(parseInstantTimestamp("26/8/13 00:60:00")).toBeNull(); // minut 60
  });

  it("rejects impossible calendar dates (Feb 30, Apr 31) via round-trip check", () => {
    // Date.UTC(2026, 1, 30) ar normaliza silențios la 2 mar — round-trip-ul o respinge.
    expect(parseInstantTimestamp("26/2/30 00:00:00")).toBeNull();
    expect(parseInstantTimestamp("26/4/31 00:00:00")).toBeNull();
    // Datele valide de calendar rămân acceptate.
    expect(parseInstantTimestamp("26/2/28 23:59:59")!.t).toBe("2026-02-28T23:59:59.000Z");
  });
});

describe("parseInstantPayload (coduri SEN → câmpuri interne)", () => {
  it("parses the real captured payload with the full field mapping", () => {
    const data = parseInstantPayload(payload());
    expect(data).not.toBeNull();
    expect(data!.t).toBe("2026-08-13T15:12:27.000Z");
    expect(data!.consum).toBe(4506);
    expect(data!.productie).toBe(5007);
    expect(data!.sold).toBe(-501);
    expect(data!.carbune).toBe(584);
    expect(data!.hidrocarburi).toBe(1001);
    expect(data!.ape).toBe(260);
    expect(data!.nuclear).toBe(0);
    expect(data!.eolian).toBe(396);
    expect(data!.foto).toBe(2703);
    expect(data!.biomasa).toBe(54);
    // Contract fake-UTC: ts = epoch-ul UTC al valorii t etichetate.
    expect(data!.ts).toBe(Date.parse(data!.t));
  });

  it("returns null for non-array payloads", () => {
    expect(parseInstantPayload(null)).toBeNull();
    expect(parseInstantPayload({ CONS: "4506" })).toBeNull();
    expect(parseInstantPayload("garbage")).toBeNull();
  });

  it("returns null when a required SEN code is missing", () => {
    const noFoto = payload({});
    // Scoatem FOTO din listă.
    const without = noFoto.filter((p) => !("FOTO" in (p as Record<string, unknown>)));
    expect(parseInstantPayload(without)).toBeNull();
  });

  it("returns null for non-numeric values (strict decimal, parity with float())", () => {
    expect(parseInstantPayload(payload({ FOTO: "abc" }))).toBeNull();
    expect(parseInstantPayload(payload({ FOTO: "0x10" }))).toBeNull();
    expect(parseInstantPayload(payload({ FOTO: "1_000" }))).toBeNull();
    expect(parseInstantPayload(payload({ FOTO: "" }))).toBeNull();
    expect(parseInstantPayload(payload({ FOTO: [] }))).toBeNull();
  });

  it("returns null when the timestamp is missing or invalid", () => {
    const noTs = payload({}).filter(
      (p) => !("row1_HARTASEN_DATA" in (p as Record<string, unknown>)),
    );
    expect(parseInstantPayload(noTs)).toBeNull();
    expect(parseInstantPayload(payload({}, "not-a-timestamp"))).toBeNull();
    expect(parseInstantPayload(payload({}, "26/13/99 00:00:00"))).toBeNull();
  });

  it("rejects incoherent sold (anti-shift guard: SOLD must ≈ CONS − PROD)", () => {
    // CONS 4506 − PROD 5007 = −501; SOLD 0 → abatere 501 MW ≫ toleranță 5.
    expect(parseInstantPayload(payload({ SOLD: "0" }))).toBeNull();
    expect(parseInstantPayload(payload({ PROD: "100" }))).toBeNull(); // CONS 4506 − PROD 100 = 4406 ≠ −501
  });

  it("accepts sold within the small tolerance (rounded estimates)", () => {
    // |−504 − (−501)| = 3 ≤ 5 → trece, cu valoarea păstrată.
    const data = parseInstantPayload(payload({ SOLD: "-504" }));
    expect(data).not.toBeNull();
    expect(data!.sold).toBe(-504);
  });
});

describe("isInstantFresh (guard prospețime — badge-ul nu minte)", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");

  it("treats a 60s-old snapshot as fresh", () => {
    const data = parseInstantPayload(payload({}, labelForRealInstant(now - 60_000)))!;
    expect(isInstantFresh(data, now)).toBe(true);
  });

  it("treats a 2h-old snapshot as stale (sen-filter servește date vechi)", () => {
    const data = parseInstantPayload(payload({}, labelForRealInstant(now - 2 * 3600_000)))!;
    expect(isInstantFresh(data, now)).toBe(false);
  });

  it("treats future timestamps as fresh (clock skew — never 'stale')", () => {
    const data = parseInstantPayload(payload({}, labelForRealInstant(now + 3600_000)))!;
    expect(isInstantFresh(data, now)).toBe(true);
  });
});

describe("fetchCurrentInstant (fetch + retry pe eșec tranzitoriu)", () => {
  it("fetches /sen-filter and returns the parsed InstantData", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(payload()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const data = await fetchCurrentInstant();
    expect(data.consum).toBe(4506);
    expect(data.sold).toBe(-501);
  });

  it("throws on non-OK HTTP status", async () => {
    globalThis.fetch = mock(
      async () => new Response("nope", { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(fetchCurrentInstant()).rejects.toThrow(/HTTP 503/);
  });

  it("does NOT retry 4xx HTTP errors (deterministic, non-retryable)", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(fetchCurrentInstant()).rejects.toThrow("Transelectrica sen-filter HTTP 404");
    expect(calls).toBe(1); // exact 1 apel, 0 reîncercări (paritate cu live.ts, fix 0.3.24)
  });

  it("retries once on a transient network error, then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) throw new Error("Transelectrica sen-filter timeout");
      return new Response(JSON.stringify(payload()), { status: 200 });
    }) as unknown as typeof fetch;

    const data = await fetchCurrentInstant();
    expect(data.consum).toBe(4506);
    expect(calls).toBe(2); // exact 1 reîncercare
  });

  it("does NOT retry when the payload is invalid (deterministic)", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      return new Response(JSON.stringify({ CONS: "4506" }), { status: 200 }); // payload incomplet
    }) as unknown as typeof fetch;

    await expect(fetchCurrentInstant()).rejects.toThrow(/payload invalid/);
    expect(calls).toBe(1);
  });
});

describe("getInstantData (cache TTL + backoff + inflight + prospețime)", () => {
  it("fetches once, then serves from cache within TTL", async () => {
    const mockNow = Date.parse("2026-08-13T12:00:00.000Z");
    spyOn(Date, "now").mockImplementation(() => mockNow);
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify(payload({}, labelForRealInstant(mockNow - 60_000))), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const a = await getInstantData();
    const b = await getInstantData();
    expect(a?.consum).toBe(4506);
    expect(b?.consum).toBe(4506);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs off after a failure (no refetch within 30s)", async () => {
    const mockNow = Date.parse("2026-08-13T12:00:00.000Z");
    spyOn(Date, "now").mockImplementation(() => mockNow);
    const fail = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    globalThis.fetch = fail;

    await getInstantData(); // eșuează: 1 încercare + 1 retry (2 fetch-uri) → backoff
    await getInstantData(); // în backoff: ZERO fetch-uri suplimentare
    expect(fail).toHaveBeenCalledTimes(2); // exact 1 încercare + 1 retry, nimic după
  });

  it("shares a single in-flight fetch across concurrent cold-cache requests", async () => {
    const mockNow = Date.parse("2026-08-13T12:00:00.000Z");
    spyOn(Date, "now").mockImplementation(() => mockNow);
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify(payload({}, labelForRealInstant(mockNow - 60_000))), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const [a, b] = await Promise.all([getInstantData(), getInstantData()]);
    expect(a?.consum).toBe(4506);
    expect(b?.consum).toBe(4506);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null (and does not cache) when the snapshot is older than the freshness threshold", async () => {
    let mockNow = Date.parse("2026-08-13T12:00:00.000Z");
    spyOn(Date, "now").mockImplementation(() => mockNow);
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify(payload({}, labelForRealInstant(mockNow - 2 * 3600_000))), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    expect(await getInstantData()).toBeNull();

    // Avansăm peste backoff (30s): snapshot-ul vechi NU a fost cache-uit → refetch.
    mockNow += 31_000;
    expect(await getInstantData()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null without throwing when the live fetch fails (UI falls back to summary.latest)", async () => {
    const mockNow = Date.parse("2026-08-13T12:00:00.000Z");
    spyOn(Date, "now").mockImplementation(() => mockNow);
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(getInstantData()).resolves.toBeNull();
  });
});
