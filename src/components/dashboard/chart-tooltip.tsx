"use client";

import type { TooltipProps } from "recharts";

import { formatDateTime, formatNumber } from "@/lib/sen/format";

interface Row {
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
}

/**
 * Tooltip comun pentru graficele Recharts. Stilizat manual pentru a evita
 * aspectul "out of the box" și pentru a păstra consistentă cu tema.
 * Sortează rândurile descrescător după valoare.
 */
export function ChartTooltip({ active, payload, label, labels, unit = "MW" }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rows: Row[] = payload
    .filter((p) => typeof p.value === "number")
    .map((p) => {
      const key = String(p.dataKey ?? p.name);
      const name = labels?.[key] ?? p.name ?? key;
      return {
        name,
        value: p.value as number,
        color: (p.color as string) ?? "var(--primary)",
        unit,
      };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      {label !== undefined && label !== "" && (
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formatLabel(label)}</p>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={`${r.name}-${i}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: r.color }}
              aria-hidden
            />
            <span className="min-w-[7rem] truncate text-muted-foreground">{r.name}</span>
            <span className="ml-auto font-mono font-semibold tabular-nums">
              {formatNumber(r.value)}
            </span>
            <span className="text-muted-foreground">{r.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatLabel(label: unknown): string {
  if (typeof label === "string" && /^\d{4}-\d{2}-\d{2}T/.test(label)) {
    // ISO timestamp — reutilizăm formatDateTime (UTC, contract de timp).
    return formatDateTime(label);
  }
  if (typeof label === "number") {
    return formatNumber(label);
  }
  return String(label);
}
