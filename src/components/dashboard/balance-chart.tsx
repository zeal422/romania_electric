"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./chart-tooltip";
import { SERIES_COLORS } from "@/lib/sen/constants";
import { formatAxisTick, formatSigned } from "@/lib/sen/format";
import type { AggregatedPoint, Granularity } from "@/lib/sen/types";

interface BalanceChartProps {
  points: AggregatedPoint[];
  granularity: Granularity;
}

/**
 * Balanța energetică (Sold): aria cu gradient divergent — verde pozitiv (export),
 * roșu negativ (import) — cu linie de referință la zero. Arată când România
 * exportă vs când importă energie.
 */
export function BalanceChart({ points, granularity }: BalanceChartProps) {
  const labels = useMemo(() => ({ sold: "Sold" }), []);

  // Calcul offset pentru a face gradientul divergent funcțional:
  // Recharts umple de la dataMin la valoare. Folosim un offset astfel încât
  // zero să fie plasat corect — determinăm min/max din date.
  const { yMin, yMax } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const p of points) {
      if (p.sold < lo) lo = p.sold;
      if (p.sold > hi) hi = p.sold;
    }
    const pad = Math.max(Math.abs(lo), Math.abs(hi)) * 0.1 || 100;
    return { yMin: Math.floor(lo - pad), yMax: Math.ceil(hi + pad) };
  }, [points]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="grad-sold-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS.soldPositive} stopOpacity={0.7} />
            <stop offset="100%" stopColor={SERIES_COLORS.soldPositive} stopOpacity={0.15} />
          </linearGradient>
          <linearGradient id="grad-sold-neg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={SERIES_COLORS.soldNegative} stopOpacity={0.7} />
            <stop offset="100%" stopColor={SERIES_COLORS.soldNegative} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="ts"
          tickFormatter={(ts) => formatAxisTick(ts as number, granularity)}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickMargin={8}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(v) => formatSigned(v as number)}
          tickLine={false}
          axisLine={false}
          width={56}
          tickMargin={4}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        <Tooltip
          content={<ChartTooltip labels={labels} />}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="sold"
          name="sold"
          stroke="var(--foreground)"
          strokeWidth={1.25}
          fill="url(#grad-sold-pos)"
          isAnimationActive={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
