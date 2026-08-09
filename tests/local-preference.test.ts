import { describe, expect, it } from "bun:test";

import {
  readLocalPreference,
  writeLocalPreference,
  type PrefStorage,
} from "@/lib/local-preference";
import { GRANULARITIES, granularitiesForPreset, type Granularity } from "@/lib/sen/types";

// Notă conștientă: `subscribe` (add/removeEventListener pe evenimentul `storage`)
// nu are test aici — necesită `window`/DOM, iar proiectul testează fără DOM.
// Logica testată e tocmai partea reparată (protecția la excepții + fallback +
// validare), care trăiește în funcțiile pure read/writeLocalPreference.

/** Storage fake controlabil: poate arunca la getItem/setItem (simulează sandbox/storage blocat). */
function makeStorage(overrides: Partial<PrefStorage> = {}): PrefStorage {
  return {
    getItem: () => null,
    setItem: () => {},
    ...overrides,
  };
}

const isGranularity = (v: string): v is Granularity => (GRANULARITIES as string[]).includes(v);

describe("readLocalPreference", () => {
  it("returns the stored value for a readable key", () => {
    const storage = makeStorage({ getItem: () => "day" });
    expect(readLocalPreference(storage, "sen:granularity", "hour")).toBe("day");
  });

  it("returns fallback when the key is missing (null)", () => {
    const storage = makeStorage({ getItem: () => null });
    expect(readLocalPreference(storage, "sen:granularity", "hour")).toBe("hour");
  });

  it("returns fallback when localStorage throws (storage blocked / sandbox)", () => {
    const storage = makeStorage({
      getItem: () => {
        throw new Error("SecurityError: access denied");
      },
    });
    expect(readLocalPreference(storage, "sen:granularity", "hour")).toBe("hour");
  });

  it("returns fallback when the stored value fails isValid", () => {
    const storage = makeStorage({ getItem: () => "nan" });
    expect(readLocalPreference(storage, "sen:granularity", "hour", isGranularity)).toBe("hour");
  });

  it("keeps a stored value that passes isValid", () => {
    const storage = makeStorage({ getItem: () => "10m" });
    expect(
      readLocalPreference<Granularity>(storage, "sen:granularity", "hour", isGranularity),
    ).toBe("10m");
  });

  it("stores raw strings, not JSON (no parse involved)", () => {
    // Valoarea stocată e string brut (ex: "day"), NU JSON ("\"day\"" sau un obiect).
    const storage = makeStorage({ getItem: () => "day" });
    expect(readLocalPreference(storage, "sen:granularity", "hour")).toBe("day");
  });

  it("returns string (not T) when no validator is given — even for garbage values", () => {
    // Fără `isValid`, valoarea stocată nu e garantată a fi din setul lui `T`:
    // tipul de întoarcere e `string`, NU `Granularity` (nimic nu confirmă altfel).
    const storage = makeStorage({ getItem: () => "not-a-granularity" });
    const value: string = readLocalPreference(storage, "sen:granularity", "hour");
    expect(value).toBe("not-a-granularity");
  });

  it("narrows to T only when a type-predicate validator confirms the value", () => {
    const storage = makeStorage({ getItem: () => "day" });
    const value: Granularity = readLocalPreference<Granularity>(
      storage,
      "sen:granularity",
      "hour",
      isGranularity,
    );
    expect(value).toBe("day");
  });
});

describe("granularitiesForPreset (compatibilitate preset → granularitate)", () => {
  it("exposes all granularities for default presets (3d/7d)", () => {
    expect(granularitiesForPreset("3d")).toEqual(GRANULARITIES);
    expect(granularitiesForPreset("7d")).toEqual(GRANULARITIES);
  });

  it("excludes day for 24h (too coarse for a single day)", () => {
    const list = granularitiesForPreset("24h") as Granularity[];
    expect(list).not.toContain("day");
    expect(list).toContain("raw");
    expect(list).toContain("10m");
    expect(list).toContain("hour");
  });

  it("excludes raw/10m for long ranges (30d/all too dense)", () => {
    for (const preset of ["30d", "all"] as const) {
      const list = granularitiesForPreset(preset) as Granularity[];
      expect(list).not.toContain("raw");
      expect(list).not.toContain("10m");
      expect(list).toContain("hour");
      expect(list).toContain("day");
    }
  });
});

describe("writeLocalPreference", () => {
  it("writes the value and reports success", () => {
    const written: Record<string, string> = {};
    const storage = makeStorage({
      setItem: (k, v) => {
        written[k] = v;
      },
    });
    expect(writeLocalPreference(storage, "sen:granularity", "day")).toBe(true);
    expect(written["sen:granularity"]).toBe("day");
  });

  it("returns false (no throw) when localStorage throws", () => {
    const storage = makeStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(writeLocalPreference(storage, "sen:granularity", "day")).toBe(false);
  });
});
