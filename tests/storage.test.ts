import { afterEach, describe, expect, it, mock } from "bun:test";

import {
  extractIspoz,
  fetchCurrentIspoz,
  getStorageData,
  loadStorageHistory,
  pickMostRecent,
  resetStorageCache,
} from "@/lib/sen/storage";

afterEach(() => {
  resetStorageCache();
  mock.restore();
});

describe("extractIspoz", () => {
  it("extracts ISPOZ from a sen-filter payload (list of {code: value} pairs)", () => {
    const payload = [{ KOZL115: "176" }, { ISPOZ: "30" }, { CARB: "778" }];
    expect(extractIspoz(payload)).toBe(30);
  });

  it("returns null when ISPOZ is missing", () => {
    expect(extractIspoz([{ CARB: "778" }, { PROD: "6354" }])).toBeNull();
  });

  it("returns null for non-numeric or negative ISPOZ", () => {
    expect(extractIspoz([{ ISPOZ: "abc" }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: "-5" }])).toBeNull();
  });

  it("returns null for non-array payloads", () => {
    expect(extractIspoz(null)).toBeNull();
    expect(extractIspoz({ ISPOZ: "30" })).toBeNull();
    expect(extractIspoz("garbage")).toBeNull();
  });

  it("rejects empty/whitespace strings, null and arrays before Number() (fix TO_FIX #8)", () => {
    // Number("")===0, Number("  ")===0, Number(null)===0, Number([])===0 —
    // dar extract_ispoz din Python le respinge (float aruncă). TS trebuie la fel.
    expect(extractIspoz([{ ISPOZ: "" }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: "   " }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: null }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: [] }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: undefined }])).toBeNull();
    // Paritate cu float() din Python: hex/binary/octal/underscore respinse
    // (Number() le-ar accepta: 0x10=16, 0b101=5, 1_000=1000).
    expect(extractIspoz([{ ISPOZ: "0x10" }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: "0b101" }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: "1_000" }])).toBeNull();
    expect(extractIspoz([{ ISPOZ: "nan" }])).toBeNull();
    // Valori valide rămân acceptate (zecimale + exponent, ca float()).
    expect(extractIspoz([{ ISPOZ: "30.5" }])).toBe(30.5);
    expect(extractIspoz([{ ISPOZ: "1e3" }])).toBe(1000);
    expect(extractIspoz([{ ISPOZ: 30 }])).toBe(30);
  });
});

describe("loadStorageHistory", () => {
  it("loads the accumulated series from data/sen-storage.json, sorted ascending", async () => {
    const history = await loadStorageHistory();
    expect(history.length).toBeGreaterThan(0);
    for (let i = 1; i < history.length; i++) {
      expect(history[i].ts).toBeGreaterThanOrEqual(history[i - 1].ts);
    }
    for (const p of history) {
      expect(typeof p.ispoz).toBe("number");
      expect(p.ispoz).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("fetchCurrentIspoz", () => {
  it("fetches /sen-filter and returns the numeric ISPOZ", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify([{ KOZL115: "176" }, { ISPOZ: "41" }, { PROD: "6000" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    await expect(fetchCurrentIspoz()).resolves.toBe(41);
  });

  it("throws on non-OK HTTP status", async () => {
    globalThis.fetch = mock(
      async () => new Response("nope", { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(fetchCurrentIspoz()).rejects.toThrow(/HTTP 503/);
  });

  it("throws when the payload has no ISPOZ", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify([{ CARB: "100" }]), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(fetchCurrentIspoz()).rejects.toThrow(/ISPOZ lipsă/);
  });
});

describe("getStorageData (cache TTL + fallback)", () => {
  it("returns the live snapshot as current with history intact", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify([{ ISPOZ: "50" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const data = await getStorageData();
    expect(data.current?.ispoz).toBe(50);
    expect(data.history.length).toBeGreaterThan(0);
    expect(data.fetchedAt).toBeGreaterThan(0);
    // Fix P3-002: snapshot-ul live e marcat cu proveniența „live”.
    expect(data.current?.source).toBe("live");
    // Fix TO_FIX #6: ts = epoch-ul UTC al valorii t etichetate (contract fake-UTC).
    expect(data.current?.ts).toBe(Date.parse(data.current?.t ?? ""));
  });

  it("serves current from cache on repeat calls (no second fetch within TTL)", async () => {
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify([{ ISPOZ: "55" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const first = await getStorageData();
    const second = await getStorageData();
    expect(second.current?.ispoz).toBe(first.current?.ispoz);
    // Un singur fetch pentru ambele apeluri (cache TTL 10 min).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the last captured point when the live fetch fails", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const data = await getStorageData();
    // Nu aruncă: current e ultima captură acumulată (sau null dacă nu există istoric).
    expect(data.history.length).toBeGreaterThan(0);
    expect(data.current?.ispoz).toBe(data.history[data.history.length - 1].ispoz);
    // Fix P3-002: fallback-ul PUR (din istoric) e marcat „capture” cu fetchedAt 0.
    expect(data.current?.source).toBe("capture");
    expect(data.fetchedAt).toBe(0);
  });

  it("backs off after a fetch failure (no immediate refetch within 1 min)", async () => {
    const failOnce = mock(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    globalThis.fetch = failOnce;

    await getStorageData(); // eșuează → backoff
    await getStorageData(); // în backoff: nu mai încearcă
    expect(failOnce).toHaveBeenCalledTimes(1);
  });

  it("computes t/fetchedAt from the post-fetch moment, not the pre-await now (fix TO_FIX F3)", async () => {
    // Fetch lent (60ms): la un fetch lent, timestamp-ul valorii și fetchedAt-ul
    // (baza TTL-ului) trebuie să reflecte momentul REAL după fetch, nu `now`-ul
    // capturat înainte de await (care ar fi decalat cu ~durata fetch-ului).
    // Pragul la 40ms din 60ms sleep: marjă suficientă ca un CI lent (citirea
    // fișierului istoric ~1-5ms tipic) să NU lase codul vechi să treacă testul.
    const before = Date.now();
    globalThis.fetch = mock(async () => {
      await Bun.sleep(60);
      return new Response(JSON.stringify([{ ISPOZ: "80" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const data = await getStorageData();
    expect(data.current?.ispoz).toBe(80);
    expect(data.current?.source).toBe("live");
    // fetchedAt trebuie să fie cel puțin la fel de mare ca momentul de după fetch
    // (before + 60ms). Cu codul vechi ar fi ≈ `before` (pre-await) — sub prag.
    expect(data.fetchedAt).toBeGreaterThanOrEqual(before + 40);
    // Contract fake-UTC rămâne intact: ts = epoch-ul UTC al lui t.
    expect(data.current?.ts).toBe(Date.parse(data.current?.t ?? ""));
  });

  it("shares a single in-flight fetch across concurrent cold-cache requests", async () => {
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify([{ ISPOZ: "60" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    // Două apeluri CONCURENTE pe cache rece: ambele trebuie să primească 60
    // cu UN SINGUR fetch la /sen-filter (pattern inflightFetch, ca live.ts).
    const [a, b] = await Promise.all([getStorageData(), getStorageData()]);
    expect(a.current?.ispoz).toBe(60);
    expect(b.current?.ispoz).toBe(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the live snapshot (source live) when the fetch fails while cache is still fresh", async () => {
    // Primul fetch reușește → currentCache (source live, în TTL).
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify([{ ISPOZ: "70" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const first = await getStorageData();
    expect(first.current?.source).toBe("live");
    const liveFetchedAt = first.fetchedAt;

    // Al doilea apel e în TTL (cache proaspăt) → niciun fetch, același current.
    globalThis.fetch = mock(async () => {
      throw new Error("nu trebuie apelat");
    }) as unknown as typeof fetch;
    const second = await getStorageData();
    expect(second.current?.ispoz).toBe(70);
    expect(second.current?.source).toBe("live");
    expect(second.fetchedAt).toBe(liveFetchedAt);
  });
});

describe("pickMostRecent (alegerea cached vs ultima captură — fix P3-002)", () => {
  const live = { t: "L", ts: 2000, ispoz: 70, source: "live" as const };
  const capture = { t: "C", ts: 1000, ispoz: 60, source: "capture" as const };

  it("preferă snapshot-ul live stale când e mai nou decât ultima captură", () => {
    // TTL expirat, fetch a eșuat: current rămâne snapshot-ul live (nu „capture”).
    const picked = pickMostRecent(live, capture);
    expect(picked?.source).toBe("live");
    expect(picked?.ispoz).toBe(70);
  });

  it("preferă ultima captură când e mai nouă decât snapshot-ul live", () => {
    const olderLive = { ...live, ts: 500 };
    const picked = pickMostRecent(olderLive, capture);
    expect(picked?.source).toBe("capture");
    expect(picked?.ispoz).toBe(60);
  });

  it("întoarce null când nu există nicio valoare cunoscută", () => {
    expect(pickMostRecent(null, null)).toBeNull();
    expect(pickMostRecent(live, null)?.source).toBe("live");
    expect(pickMostRecent(null, capture)?.source).toBe("capture");
  });
});
