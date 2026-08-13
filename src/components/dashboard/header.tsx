"use client";

import { Activity, Zap } from "lucide-react";

import { ThemeToggle } from "./theme-toggle";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatLastUpdatedLabel, formatRelative } from "@/lib/sen/format";
import type { SenSummaryResponse } from "@/lib/sen/types";

interface HeaderProps {
  summary: SenSummaryResponse | undefined;
}

/**
 * Antet sticky: titlu, sursa datelor, badge "live" și ora ultimei înregistrări.
 * Conține și comutatorul de temă.
 */
export function Header({ summary }: HeaderProps) {
  const latestIso = summary?.latest?.t;
  const lastUpdated = latestIso ? formatDateTime(latestIso, { withYear: true }) : "—";
  const relative = latestIso ? formatRelative(latestIso, Date.now()) : null;

  return (
    <header className="sticky top-0 z-40 glass-header">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-xs shadow-primary/15 transition-transform hover:scale-105">
          <Zap className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Sistemul Energetic Național
            </h1>
            <span className="hidden text-muted-foreground/70 sm:inline">·</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">România</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            Date: Transelectrica ·{" "}
            <a
              href="https://www.transelectrica.ro/web/tel/sistemul-energetic-national"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              SEN realtime
            </a>
            {latestIso && (
              <>
                {" · "}actualizat {relative}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {latestIso && (
            <Badge
              variant="secondary"
              role="status"
              className="hidden gap-1.5 border border-primary/20 bg-primary/10 text-primary backdrop-blur-xs sm:flex"
              aria-label={formatLastUpdatedLabel(relative ?? "")}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="font-mono text-[11px] tabular-nums">{lastUpdated}</span>
            </Badge>
          )}
          <Badge
            variant="outline"
            className="hidden gap-1 border-border/70 bg-card/40 backdrop-blur-xs md:flex"
          >
            <Activity className="h-3 w-3 text-primary" />
            <span className="font-mono text-[11px] tabular-nums">
              {summary ? summary.count.toLocaleString("ro-RO") : "—"} puncte
            </span>
          </Badge>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
