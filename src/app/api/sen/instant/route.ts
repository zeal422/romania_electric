import { NextResponse } from "next/server";

import { getInstantData } from "@/lib/sen/instant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/sen/instant — valorile INSTANT (Consum/Producție/Sold + mix pe
 * surse) de la /sen-filter, cu polling client la ~30s. La eșec/stale răspunde
 * `null` (UI-ul cade pe summary.latest) — site-ul nu se rupe niciodată.
 */
export async function GET() {
  const data = await getInstantData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
    },
  });
}
