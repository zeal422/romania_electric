"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { useHoverStore } from "@/hooks/use-hover-store";
import { buildLegendRows } from "@/lib/sen/constants";
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
  const hoveredSource = useHoverStore((state) => state.hoveredSource);
  const setHoveredSource = useHoverStore((state) => state.setHoveredSource);

  // Legenda: de sus în jos, de la mare la mic (ca înainte); sursele la 0 rămân
  // vizibile la final cu zero-state, nu dispar (buildLegendRows le include mereu).
  const legendData = buildLegendRows(latest).sort((a, b) => b.value - a.value);
  const donutData = legendData.filter((d) => d.value > 0);

  const total = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {donutData.map((d) => (
                <Cell
                  key={d.field}
                  fill={d.color}
                  onMouseEnter={() => setHoveredSource(d.field)}
                  onMouseLeave={() => setHoveredSource(null)}
                  className={`cursor-pointer transition-opacity duration-200 pie-${d.field}`}
                />
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
        {!latest ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nicio înregistrare</p>
        ) : (
          legendData.map((d) => {
            const isHovered = hoveredSource === d.field;
            const isDimmed = hoveredSource !== null && !isHovered;
            const rowOpacity = d.isZero ? "opacity-50" : isDimmed ? "opacity-35" : "opacity-100";
            const baseClass =
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-left transition-all duration-200";
            const content = (
              <>
                {d.isZero ? (
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/40"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: d.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
                <span className="font-mono font-medium tabular-nums">{formatNumber(d.value)}</span>
                <span className="w-12 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                  {d.isZero ? "—" : formatPercent((100 * d.value) / total)}
                </span>
              </>
            );

            // Zero-state: element noninteractiv (div) — nu e focusabil și nu participă
            // la hover-store (n-are felie în donut de evidențiat); tooltip-ul rămâne.
            if (d.isZero) {
              return (
                <div
                  key={d.field}
                  title={d.hint}
                  className={`${baseClass} ${rowOpacity} cursor-default`}
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                type="button"
                key={d.field}
                title={d.hint}
                onMouseEnter={() => setHoveredSource(d.field)}
                onMouseLeave={() => setHoveredSource(null)}
                onFocus={() => setHoveredSource(d.field)}
                onBlur={() => setHoveredSource(null)}
                className={`${baseClass} ${rowOpacity} cursor-pointer ${
                  isHovered
                    ? "bg-accent/80 font-medium text-foreground scale-[1.02]"
                    : "hover:bg-accent/50"
                }`}
              >
                {content}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
