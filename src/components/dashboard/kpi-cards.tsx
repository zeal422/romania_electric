"use client";

import { ArrowDownRight, ArrowUpRight, Leaf, Minus, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SERIES_COLORS } from "@/lib/sen/constants";
import { formatNumber, formatPercent, formatSigned, formatSold } from "@/lib/sen/format";
import type { SenSummaryResponse } from "@/lib/sen/types";

interface KpiCardsProps {
  summary: SenSummaryResponse | undefined;
  renewableShare: number | undefined;
}

interface KpiCardData {
  title: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  accent: string;
  /** Culoare inline opțională (ex: din SERIES_COLORS) — suplimentară la `accent`. */
  accentStyle?: React.CSSProperties;
  sub: { label: string; value: string }[];
  trend?: { dir: "up" | "down" | "flat"; text: string; positive?: boolean };
}

/**
 * Rând de 4 carduri KPI: consum curent, producție curentă, sold (import/export)
 * și share-ul regenerabil. Compară cu media intervalului pentru context.
 */
export function KpiCards({ summary, renewableShare }: KpiCardsProps) {
  const latest = summary?.latest;
  const stats = summary?.stats;

  const cards: KpiCardData[] = [
    {
      title: "Consum",
      value: latest ? formatNumber(latest.consum) : "—",
      unit: "MW",
      icon: <Zap className="h-4 w-4" />,
      accent: "text-red-500",
      sub: [
        {
          label: "Media interval",
          value: stats ? formatNumber(stats.consum.avg) : "—",
        },
        {
          label: "Min / Max",
          value: stats
            ? `${formatNumber(stats.consum.min)} / ${formatNumber(stats.consum.max)}`
            : "—",
        },
      ],
      trend:
        latest && stats
          ? latest.consum > stats.consum.avg
            ? { dir: "up", text: "peste medie", positive: false }
            : { dir: "down", text: "sub medie", positive: true }
          : undefined,
    },
    {
      title: "Producție",
      value: latest ? formatNumber(latest.productie) : "—",
      unit: "MW",
      icon: <Zap className="h-4 w-4" />,
      accent: "text-emerald-500",
      sub: [
        {
          label: "Media interval",
          value: stats ? formatNumber(stats.productie.avg) : "—",
        },
        {
          label: "Min / Max",
          value: stats
            ? `${formatNumber(stats.productie.min)} / ${formatNumber(stats.productie.max)}`
            : "—",
        },
      ],
    },
    {
      // Semantica sold (sursa oficială: SOLD = CONS − PROD): sold > 0 = IMPORT,
      // sold < 0 = EXPORT. Eticheta și culorile vin din shared metadata
      // (formatSold + SERIES_COLORS), nu sunt hardcodate aici.
      title: "Sold energetic",
      value: latest ? formatSigned(latest.sold) : "—",
      unit: "MW",
      icon:
        latest && latest.sold > 0 ? (
          <ArrowDownRight className="h-4 w-4" />
        ) : latest && latest.sold < 0 ? (
          <ArrowUpRight className="h-4 w-4" />
        ) : (
          <Minus className="h-4 w-4" />
        ),
      accent: latest && latest.sold === 0 ? "text-muted-foreground" : "",
      accentStyle:
        latest && latest.sold > 0
          ? { color: SERIES_COLORS.soldPositive }
          : latest && latest.sold < 0
            ? { color: SERIES_COLORS.soldNegative }
            : undefined,
      sub: [
        {
          label: "Stare",
          value: latest ? formatSold(latest.sold).label : "—",
        },
        {
          label: "Net mediu",
          value: stats ? formatSigned(stats.sold.avg) : "—",
        },
      ],
    },
    {
      title: "Share regenerabil",
      value: renewableShare !== undefined ? formatPercent(renewableShare) : "—",
      icon: <Leaf className="h-4 w-4" />,
      accent: "text-lime-500",
      sub: [
        {
          label: "Media totală",
          value: summary ? formatPercent(summary.renewableShareAvg) : "—",
        },
        {
          label: "Import (din probe)",
          value: summary ? formatPercent(summary.balance.importShare) : "—",
        },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card
          key={c.title}
          className="relative overflow-hidden border-border/70 p-4 transition-colors hover:border-border"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.title}
              </p>
              <p className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                  {c.value}
                </span>
                {c.unit && (
                  <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-md bg-card/60 p-1.5 ${c.accent}`}
              style={c.accentStyle}
            >
              {c.icon}
            </span>
          </div>

          {c.trend && (
            <div className="mt-2 flex items-center gap-1 text-[11px]">
              {c.trend.dir === "up" ? (
                <ArrowUpRight
                  className={`h-3 w-3 ${c.trend.positive ? "text-emerald-500" : "text-red-500"}`}
                />
              ) : (
                <ArrowDownRight
                  className={`h-3 w-3 ${c.trend.positive ? "text-emerald-500" : "text-red-500"}`}
                />
              )}
              <span className={c.trend.positive ? "text-emerald-500" : "text-red-500"}>
                {c.trend.text}
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1 border-t border-border/60 pt-2">
            {c.sub.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-mono font-medium tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
