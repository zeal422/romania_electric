import { NextResponse } from "next/server";

import { getLiveSummary } from "@/lib/sen/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/sen/summary — KPI global precalculat + cea mai recentă înregistrare. */
export async function GET() {
  const summary = await getLiveSummary();
  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
