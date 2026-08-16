"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./chart-tooltip";
import { useHoverStore } from "@/hooks/use-hover-store";
import { SOURCE_ORDER, SOURCES, SERIES_COLORS } from "@/lib/sen/constants";
import { formatAxisTick, formatNumber } from "@/lib/sen/format";
import type { AggregatedPoint, Granularity } from "@/lib/sen/types";

interface ProductionMixChartProps {
  points: AggregatedPoint[];
  granularity: Granularity;
}

const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };

/**
 * Grafic principal: producția defalcată pe surse (aria stivuită) cu linia de
 * consum trasată deasupra (punctat), pentru a vedea echilibrul cerere/ofertă.
 */
export function ProductionMixChart({ points, granularity }: ProductionMixChartProps) {
  const setHoveredSource = useHoverStore((state) => state.setHoveredSource);

  const labels = useMemo(() => {
    const m: Record<string, string> = { consum: "Consum" };
    for (const f of SOURCE_ORDER) m[f] = SOURCES[f].label;
    return m;
  }, []);

  const tickFormatter = useMemo(() => {
    return (ts: number) => formatAxisTick(ts, granularity);
  }, [granularity]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* ComposedChart, NU AreaChart: în recharts 2.15 `<Line>` nu se randează
          deloc în interiorul unui AreaChart (bug preexistent — linia de consum
          lipsea deși subtitlul o promitea), dar merge în ComposedChart, care
          există exact pentru a combina arii stivuite + linii. */}
      <ComposedChart data={points} margin={MARGIN}>
        <defs>
          {SOURCE_ORDER.map((f) => (
            <linearGradient key={f} id={`grad-${f}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SOURCES[f].color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={SOURCES[f].color} stopOpacity={0.45} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="ts"
          tickFormatter={tickFormatter}
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
          content={
            <ChartTooltip
              labels={labels}
              showTotals
              labelFormatter={(ts) => formatAxisTick(ts as number, granularity)}
            />
          }
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        {SOURCE_ORDER.map((f) => (
          <Area
            key={f}
            type="monotone"
            dataKey={f}
            name={f}
            stackId="sources"
            stroke={SOURCES[f].color}
            fill={`url(#grad-${f})`}
            isAnimationActive={false}
            className={`area-${f}`}
            onMouseEnter={() => setHoveredSource(f)}
            onMouseLeave={() => setHoveredSource(null)}
          />
        ))}

        <Line
          type="monotone"
          dataKey="consum"
          name="consum"
          stroke={SERIES_COLORS.consum}
          strokeWidth={1.75}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
        >
          {/* Eticheta „Consum” lângă ultimul punct al liniei: LabelList TREBUIE
              să fie COPIL al Line (renderCallByParent îl caută în children-ul
              liniei), cu content custom care randează textul DOAR pe ultimul
              punct (index-ul maxim). Se calculează client-side — în SSR nu
              apare, dar în browser da. */}
          <LabelList
            dataKey="consum"
            position="right"
            content={(props) => {
              const { x, y, index } = props as { x?: number; y?: number; index?: number };
              if (index === undefined || x === undefined || y === undefined) return null;
              if (index !== points.length - 1) return null;
              return (
                <text
                  x={x + 6}
                  y={y - 4}
                  fill={SERIES_COLORS.consum}
                  fontSize={10}
                  fontWeight={600}
                  className="select-none"
                >
                  Consum
                </text>
              );
            }}
          />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
