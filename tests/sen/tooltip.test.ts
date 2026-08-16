import { describe, expect, it } from "bun:test";

import { buildTooltipRows, type TooltipPayloadEntry } from "@/lib/sen/tooltip";

/** Creează un payload minim (ca cel pe care Recharts îl dă la content). */
function entry(
  dataKey: string,
  value: number,
  overrides: Partial<TooltipPayloadEntry> = {},
): TooltipPayloadEntry {
  return { dataKey, name: dataKey, value, color: "#000", ...overrides };
}

describe("buildTooltipRows (filtrare/sortare rânduri tooltip)", () => {
  it("maparea numelor prin labels și sortarea descrescătoare după valoare", () => {
    const rows = buildTooltipRows(
      [entry("sold", -75), entry("consum", 5000), entry("productie", 4700)],
      { labels: { sold: "Sold net" } },
    );
    expect(rows.map((r) => r.name)).toEqual(["consum", "productie", "Sold net"]);
    expect(rows.map((r) => r.value)).toEqual([5000, 4700, -75]);
  });

  it("filtrul hideZero ascunde rândurile cu valoare 0 (seriile de fill clamate)", () => {
    // Balanța: soldImport = 0 când sold < 0 — trebuie ascuns, nu afișat ca „Import 0”.
    const rows = buildTooltipRows(
      [
        entry("soldImport", 0, { name: "Import" }),
        entry("soldExport", -75, { name: "Export" }),
        entry("sold", -75, { name: "Sold net" }),
      ],
      { hideZero: true, labels: { soldImport: "Import", soldExport: "Export", sold: "Sold net" } },
    );
    expect(rows.map((r) => r.key)).toEqual(["soldExport", "sold"]); // fără soldImport (0)
    expect(rows.map((r) => r.name)).toEqual(["Export", "Sold net"]);
  });

  it("filtrul hideKeys ascunde seriile de fill pentru gradient (nu apar niciodată)", () => {
    // Bug real (fix): seriile de fill apăreau ca „Export -75” lângă „Sold net -75”.
    const rows = buildTooltipRows(
      [entry("soldImport", 0), entry("soldExport", -75), entry("sold", -75, { name: "Sold net" })],
      { hideKeys: ["soldImport", "soldExport"], labels: { sold: "Sold net" } },
    );
    expect(rows.map((r) => r.key)).toEqual(["sold"]);
    expect(rows).toHaveLength(1);
  });

  it("showTotals exclude rândul duplicat de consum (antetul îl afișează deja)", () => {
    const rows = buildTooltipRows([entry("consum", 5000), entry("nuclear", 2000)], {
      showTotals: true,
    });
    expect(rows.map((r) => r.key)).toEqual(["nuclear"]);
  });

  it("intrările nenumerice sunt ignorate (fără crash)", () => {
    const rows = buildTooltipRows([
      entry("ok", 42),
      { dataKey: "bad", name: "Bad", value: "nu-e-numar", color: "#000" },
      { dataKey: "missing", name: "Missing" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("ok");
  });

  it("payload gol/undefined → listă goală", () => {
    expect(buildTooltipRows(undefined)).toEqual([]);
    expect(buildTooltipRows([])).toEqual([]);
  });

  it("fără labels, numele cade pe name-ul payload-ului, apoi pe cheie", () => {
    expect(buildTooltipRows([entry("sold", 1, { name: "Sold net" })])[0]!.name).toBe("Sold net");
    expect(buildTooltipRows([entry("sold", 1)])[0]!.name).toBe("sold");
  });

  it("unit implicit MW, overridabil; color fallback la var(--primary)", () => {
    const rows = buildTooltipRows([entry("a", 1)]);
    expect(rows[0]!.unit).toBe("MW");
    expect(rows[0]!.color).toBe("#000");
    const rows2 = buildTooltipRows([{ dataKey: "x", name: "x", value: 5 }], { unit: "GWh" });
    expect(rows2[0]!.unit).toBe("GWh");
    expect(rows2[0]!.color).toBe("var(--primary)");
  });
});
