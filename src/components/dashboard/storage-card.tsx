"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { useStorageData } from "@/hooks/use-storage-data";
import { STORAGE_COLOR, STORAGE_TREND_THRESHOLD_MW } from "@/lib/sen/constants";
import { formatDateTime, formatNumber } from "@/lib/sen/format";
import { cn } from "@/lib/utils";

/**
 * Mini-card „Stocare”: valoarea curentă de stocare (ISPOZ, MW), trendul față
 * de ultima captură și o sparkline cu seria acumulată de capturi orare.
 *
 * Istoricul se construiește de noi prin workflow-ul storage-capture (cron
 * orar) — Transelectrica expune stocarea doar ca snapshot curent. Cu puține
 * puncte, cardul arată grațios (sparkline cu 1-2 puncte, trend „în așteptare”).
 */
export function StorageCard() {
  const { data, isLoading, isError } = useStorageData();

  const current = data?.current ?? null;
  const history = data?.history ?? [];

  // Memoizat pe `history` (referință stabilă din useQuery) — NU pe un array
  // recreat la fiecare render: altfel useMemo-urile din Sparkline (gid/path)
  // ar recalcula mereu, deși valorile sunt deterministe (fix TO_FIX F4).
  const points = useMemo(() => history.map((p) => ({ ts: p.ts, value: p.ispoz })), [history]);

  const delta = useMemo(() => {
    if (!current || history.length === 0) return null;
    const last = history[history.length - 1];
    // Discriminatorul corect e timestamp-ul, nu fetchedAt: fallback-ul poate
    // întoarce fie ultima captură, fie cache-ul stale (mai nou decât ultima
    // captură dar NU în istoric). Comparăm pe ts:
    //  - current ESTE ultima captură (fallback pur) → vs penultima (altfel
    //    delta ar fi mereu 0).
    //  - altfel (snapshot live SAU cache stale) → vs ULTIMA captură; folosirea
    //    penultimei aici ar sări peste cea mai recentă captură, cu trend greșit
    //    chiar și cu semnul inversat (bug fixat).
    if (last.ts === current.ts) {
      if (history.length < 2) return null;
      return current.ispoz - history[history.length - 2].ispoz;
    }
    return current.ispoz - last.ispoz;
  }, [current, history]);

  const trendLabel =
    delta == null
      ? null
      : delta > STORAGE_TREND_THRESHOLD_MW
        ? "Încărcare"
        : delta < -STORAGE_TREND_THRESHOLD_MW
          ? "Descărcare"
          : "Stabil";
  const TrendIcon =
    delta == null
      ? null
      : delta > STORAGE_TREND_THRESHOLD_MW
        ? TrendingUp
        : delta < -STORAGE_TREND_THRESHOLD_MW
          ? TrendingDown
          : null;

  return (
    <Card className="glass-card relative overflow-hidden flex flex-col p-4 transition-all duration-300 hover:border-border/80 hover:shadow-md">
      {/* Ambient Purple Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-radial from-purple-500/10 via-transparent to-transparent opacity-70 blur-xl"
      />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Stocare</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Instalații de stocare (ISPOZ) — capturi orare
          </p>
        </div>{" "}
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={{ backgroundColor: `${STORAGE_COLOR}1f`, color: STORAGE_COLOR }}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              current?.source === "live" ? "animate-pulse" : "opacity-60",
            )}
            style={{ backgroundColor: STORAGE_COLOR }}
            aria-hidden
          />
          {/* Badge-ul reflectă PROVENIENȚA valorii (fix P3-002): un snapshot live
              stale (fetch eșuat, TTL expirat) rămâne „live”, doar punctul din
              istoric e „ultima captură”. Fără nicio valoare cunoscută → label
              RO de no-data (fix TO_FIX #7). */}
          {isLoading
            ? "se încarcă"
            : current === null
              ? "nicio captură"
              : current.source === "live"
                ? "live"
                : "ultima captură"}
        </span>
      </div>

      <div className="relative z-10 mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold tabular-nums">
              {isLoading ? "—" : current ? formatNumber(current.ispoz) : "—"}
            </span>
            <span className="text-sm text-muted-foreground">MW</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {current ? formatDateTime(current.t, { withYear: true }) : "nicio captură încă"}
          </p>
        </div>

        {trendLabel && (
          <div
            className="flex shrink-0 flex-col items-end gap-0.5"
            title={delta == null ? undefined : `Δ ${formatNumber(Math.abs(delta))} MW`}
          >
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
              style={{
                color:
                  delta != null && delta > STORAGE_TREND_THRESHOLD_MW ? STORAGE_COLOR : undefined,
              }}
            >
              {TrendIcon && <TrendIcon className="h-3.5 w-3.5" aria-hidden />}
              {delta != null && `${delta > 0 ? "+" : ""}${formatNumber(delta)} MW`}
            </span>
            <span className="text-[10px] text-muted-foreground">{trendLabel}</span>
          </div>
        )}
      </div>

      {/* h-12 = 48px explicit (fix TO_FIX F5): fără înălțime pe wrapper, h-full-ul
          SVG-ului se rezolvă pe aspect-ratio-ul viewBox-ului → sparkline-ul se
          scala cu lățimea cardului (153px+ pe ecrane late) în loc de 48px. */}
      <div className="relative z-10 mt-4 h-12">
        <Sparkline points={points} height={48} color={STORAGE_COLOR} />
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {history.length > 0
              ? `${history.length} ${history.length === 1 ? "captură" : "capturi"}`
              : "serie în construcție"}
          </span>
          <span>captură orară automată</span>
        </div>
      </div>

      {isError && (
        <p className="mt-3 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Datele de stocare nu sunt disponibile momentan.
        </p>
      )}
    </Card>
  );
}

interface SparklinePoint {
  ts: number;
  value: number;
}

/**
 * Sparkline SVG pur (fără Recharts): linie + gradient de umplere sub curbă.
 * Cu <2 puncte afișează o linie plată discretă în loc de o curbă goală.
 */
function Sparkline({
  points,
  height,
  color,
}: {
  points: SparklinePoint[];
  height: number;
  color: string;
}) {
  const width = 100; // viewBox 100×height, scalat la 100% lățime
  const gid = useMemo(() => `storage-spark-${points[0]?.ts ?? "x"}`, [points]);

  const path = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    // Valori constante (max === min): centrate vertical, nu lipite de marginea
    // de jos (unde ar arăta ca 0). La serii variabile, padding 4px sus/jos.
    const yFor = (v: number) =>
      span === 0 ? height / 2 : height - 4 - ((v - min) / span) * (height - 8);
    const stepX = width / (points.length - 1);
    return points
      .map((p, i) => {
        const x = (i * stepX).toFixed(2);
        return `${i === 0 ? "M" : "L"}${x},${yFor(p.value).toFixed(2)}`;
      })
      .join(" ");
  }, [points, height, width]);

  const area = useMemo(() => {
    if (!path) return null;
    return `${path} L${width},${height} L0,${height} Z`;
  }, [path, width, height]);

  if (!path) {
    // <2 puncte: linie plată la mijloc, semnal discret de „serie nouă”.
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        aria-hidden
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area ?? undefined} fill={`url(#${gid})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Fără cercul final: cu înălțimea fixă 48px + preserveAspectRatio="none",
          scaling-ul e non-uniform (lățime card vs viewBox 100×48) — cercul r="2.5"
          s-ar randa ca elipsă turtită. Capătul e marcat oricum de linecap-ul round. */}
    </svg>
  );
}
