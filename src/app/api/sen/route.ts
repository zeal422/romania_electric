import { NextResponse } from "next/server";

import { aggregate, downsample, filterByRange, parseRange } from "@/lib/sen/aggregate";
import { fieldStats, renewableShare } from "@/lib/sen/stats";
import type { Granularity, SenApiResponse } from "@/lib/sen/types";
import { getLiveReadings, getLiveSummary } from "@/lib/sen/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_POINTS = 1200;

function parseGranularity(v: string | null): Granularity {
  if (v === "raw" || v === "10m" || v === "hour" || v === "day") return v;
  return "hour";
}

/**
 * GET /api/sen?from=<ts>&to=<ts>&granularity=raw|10m|hour|day
 *
 * Returnează puncte agregate în intervalul cerut. Dacă granularitatea e
 * "raw" și intervalul e mare, se face sub-eșantionare uniformă la MAX_POINTS.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const granularity = parseGranularity(url.searchParams.get("granularity"));

  const [readings, summary] = await Promise.all([getLiveReadings(), getLiveSummary()]);
  const from = parseRange(url.searchParams.get("from"), summary.startTs);
  const to = parseRange(url.searchParams.get("to"), summary.endTs);

  const filtered = filterByRange(readings, from, to);
  const aggregated = aggregate(filtered, granularity);

  // Protecție: la granularitate raw pe intervale mari, sub-eșantionăm uniform.
  const points = granularity === "raw" ? downsample(aggregated, MAX_POINTS) : aggregated;

  const inRange = filtered.map((r) => r.consum);
  const prodIn = filtered.map((r) => r.productie);
  const soldIn = filtered.map((r) => r.sold);

  const body: SenApiResponse = {
    range: {
      from: new Date(from!).toISOString(),
      to: new Date(to!).toISOString(),
    },
    granularity,
    points,
    summary: {
      count: filtered.length,
      consum: fieldStats(inRange),
      productie: fieldStats(prodIn),
      sold: fieldStats(soldIn),
      renewableShareAvg: renewableShare(filtered),
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
