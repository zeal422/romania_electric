import { NextResponse } from "next/server";

import { filterByRange } from "@/lib/sen/aggregate";
import { loadReadings, loadSummary } from "@/lib/sen/loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = [
  "Data",
  "Consum[MW]",
  "Medie Consum[MW]",
  "Productie[MW]",
  "Carbune[MW]",
  "Hidrocarburi[MW]",
  "Ape[MW]",
  "Nuclear[MW]",
  "Eolian[MW]",
  "Foto[MW]",
  "Biomasa[MW]",
  "Sold[MW]",
];

const KEYS = [
  "consum",
  "medieConsum",
  "productie",
  "carbune",
  "hidrocarburi",
  "ape",
  "nuclear",
  "eolian",
  "foto",
  "biomasa",
  "sold",
] as const;

function csvEscape(v: string): string {
  if (/[",\n;]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * GET /api/sen/export?from=<ts>&to=<ts>
 * Returnează datele brute din interval ca CSV (separator ';', zecimal '.').
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const readings = await loadReadings();
  const summary = await loadSummary();
  const from = url.searchParams.get("from")
    ? Number(url.searchParams.get("from"))
    : summary.startTs;
  const to = url.searchParams.get("to") ? Number(url.searchParams.get("to")) : summary.endTs;

  const filtered = filterByRange(readings, from, to);

  const lines: string[] = [];
  lines.push(HEADERS.join(";"));
  for (const r of filtered) {
    const date = r.t.replace("T", " ").replace(".000Z", "");
    const row = [date, ...KEYS.map((k) => String(r[k]))];
    lines.push(row.map(csvEscape).join(";"));
  }
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sen-export.csv"`,
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
