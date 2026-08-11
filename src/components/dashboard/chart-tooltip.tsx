"use client";

import type { TooltipProps } from "recharts";

import { useHoverStore } from "@/hooks/use-hover-store";
import { formatDateTime, formatNumber } from "@/lib/sen/format";

import type { AggregatedPoint } from "@/lib/sen/types";

interface Row {
  key: string;
  name: string;
  value: number;
  color: string;
  unit?: string;
}

interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Mapare nume serie -> etichetă afișată. */
  labels?: Record<string, string>;
  /** Unitate implicită (default MW). */
  unit?: string;
  /** Afișează sumarul total de producție/consum în antet. */
  showTotals?: boolean;
  /** Formatare personalizată pentru eticheta de timp. */
  labelFormatter?: (label: unknown) => string;
}

/**
 * Tooltip comun pentru graficele Recharts. Stilizat manual pentru a evita
 * aspectul "out of the box" și pentru a păstra consistentă cu tema.
 * Sortează rândurile descrescător după valoare.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labels,
  unit = "MW",
  showTotals = false,
  labelFormatter,
}: ChartTooltipProps) {
  const { hoveredSource } = useHoverStore();

  if (!active || !payload || payload.length === 0) return null;

  const dataPoint = payload[0]?.payload as AggregatedPoint | undefined;

  const rows: Row[] = payload
    .filter((p) => typeof p.value === "number")
    .map((p) => {
      const key = String(p.dataKey ?? p.name);
      const name = labels?.[key] ?? p.name ?? key;
      return {
        key,
        name,
        value: p.value as number,
        color: (p.color as string) ?? "var(--primary)",
        unit,
      };
    })
    .filter((r) => !(showTotals && r.key === "consum"))
    .sort((a, b) => b.value - a.value);

  const formattedLabel = formatLabel(label, labelFormatter);

  return (
    <div className="glass-tooltip rounded-xl p-3 shadow-2xl">
      {label !== undefined && label !== "" && (
        <div className="mb-2 border-b border-border/40 pb-1.5 text-xs">
          {showTotals && dataPoint ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3 font-semibold">
                <span className="text-foreground">
                  Producție: <span className="font-mono">{formatNumber(dataPoint.productie)}</span>{" "}
                  {unit}
                </span>
                <span className="text-muted-foreground">
                  Consum: <span className="font-mono">{formatNumber(dataPoint.consum)}</span> {unit}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{formattedLabel}</p>
            </div>
          ) : (
            <p className="font-semibold text-foreground/90">{formattedLabel}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => {
          const isHovered = hoveredSource === r.key;
          const isDimmed = hoveredSource !== null && !isHovered;
          return (
            <div
              key={`${r.name}-${i}`}
              className={`flex items-center gap-2.5 text-xs transition-opacity duration-150 ${
                isDimmed ? "opacity-35" : "opacity-100"
              } ${isHovered ? "font-semibold" : ""}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-2xs"
                style={{ backgroundColor: r.color }}
                aria-hidden
              />
              <span
                className={`min-w-[7.5rem] truncate ${isHovered ? "text-foreground font-semibold" : "text-muted-foreground"}`}
              >
                {r.name}
              </span>
              <span className="ml-auto font-mono font-semibold tabular-nums text-foreground">
                {formatNumber(r.value)}
              </span>
              <span className="text-[11px] text-muted-foreground">{r.unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLabel(label: unknown, formatter?: (label: unknown) => string): string {
  if (formatter) {
    return formatter(label);
  }
  if (typeof label === "string" && /^\d{4}-\d{2}-\d{2}T/.test(label)) {
    // ISO timestamp — reutilizăm formatDateTime (UTC, contract de timp).
    return formatDateTime(label);
  }
  if (typeof label === "number") {
    // Peste timestamp-ul anului 2000 în ms
    if (label > 946684800000) {
      return formatDateTime(new Date(label).toISOString());
    }
    return formatNumber(label);
  }
  return String(label);
}
