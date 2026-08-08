"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { SOURCE_ORDER, SOURCES } from "@/lib/sen/constants";
import { formatNumber, formatPercent } from "@/lib/sen/format";
import type { SenReading } from "@/lib/sen/types";

interface SourceDistributionProps {
  latest: SenReading | undefined;
}

/**
 * Donut cu defalcarea producției pe surse pentru cea mai recentă înregistrare,
 * plus o legendă detaliată cu valoarea MW și ponderea procentuală.
 */
export function SourceDistribution({ latest }: SourceDistributionProps) {
  const data = SOURCE_ORDER.map((f) => ({
    field: f,
    label: SOURCES[f].label,
    color: SOURCES[f].color,
    value: latest ? latest[f] : 0,
  })).filter((d) => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.field} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Producție
          </span>
          <span className="font-mono text-xl font-bold tabular-nums">
            {latest ? formatNumber(latest.productie) : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">MW</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-1">
        {data.map((d) => {
          const pct = total > 0 ? (100 * d.value) / total : 0;
          return (
            <div
              key={d.field}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent/50"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: d.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
              <span className="font-mono font-medium tabular-nums">{formatNumber(d.value)}</span>
              <span className="w-12 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                {formatPercent(pct)}
              </span>
            </div>
          );
        })}
        {data.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Nicio înregistrare</p>
        )}
      </div>
    </div>
  );
}
