import { NextResponse } from "next/server";

import { getStorageData } from "@/lib/sen/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/sen/storage — valoarea curentă de stocare (ISPOZ) + seria acumulată. */
export async function GET() {
  const data = await getStorageData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
