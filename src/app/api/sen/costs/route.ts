import { NextResponse } from "next/server";

import { aggregate, filterByRange, parseRange } from "@/lib/sen/aggregate";
import { computeCosts } from "@/lib/sen/costs";
import { getLiveReadings } from "@/lib/sen/live";
import { getPriceDays } from "@/lib/sen/prices";
import type { CostsApiResponse } from "@/lib/sen/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/sen/costs?from=<ts>&to=<ts>
 *
 * Costurile estimate ale schimburilor (import/export) în intervalul selectat:
 * volumele reale Transelectrica (MWh, agregat orar) × prețurile PZU orare OPCOM.
 * Prețurile lipsă sunt EXCLUSE din cost (hasPrices=false dacă nu există niciuna)
 * — cardul afișează „prețuri indisponibile", site-ul nu se rupe.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const [readings, priceDays] = await Promise.all([getLiveReadings(), getPriceDays()]);
  const first = readings[0]?.ts;
  const last = readings[readings.length - 1]?.ts;
  const from = parseRange(url.searchParams.get("from"), first);
  const to = parseRange(url.searchParams.get("to"), last);

  if (from === undefined || to === undefined) {
    return NextResponse.json({ error: "Nicio înregistrare disponibilă" }, { status: 404 });
  }

  const filtered = filterByRange(readings, from, to);
  // Costul se calculează pe puncte ORARE (alinierea PZU e per oră de livrare).
  const points = aggregate(filtered, "hour");
  const costs = computeCosts(points, priceDays, "hour");

  const body: CostsApiResponse = {
    range: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
    costs,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
