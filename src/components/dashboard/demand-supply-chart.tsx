"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./chart-tooltip";
import { SERIES_COLORS } from "@/lib/sen/constants";
import { formatAxisTick, formatNumber } from "@/lib/sen/format";
import type { AggregatedPoint, Granularity } from "@/lib/sen/types";

interface DemandSupplyChartProps {
  points: AggregatedPoint[];
  granularity: Granularity;
}

/** Compară consumul cu producția pe intervalul selectat (două linii). */
export function DemandSupplyChart({ points, granularity }: DemandSupplyChartProps) {
  const labels = useMemo(() => ({ consum: "Consum", productie: "Producție" }), []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
          tickFormatter={(v) => formatNumber(v as number)}
          tickLine={false}
          axisLine={false}
          width={48}
          tickMargin={4}
        />
        <Tooltip
          content={<ChartTooltip labels={labels} />}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Line
          type="monotone"
          dataKey="consum"
          stroke={SERIES_COLORS.consum}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="productie"
          stroke={SERIES_COLORS.productie}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
