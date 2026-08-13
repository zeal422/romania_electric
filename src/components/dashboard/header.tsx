"use client";

import { Activity, TriangleAlert, Zap } from "lucide-react";

import { ThemeToggle } from "./theme-toggle";
import { Badge } from "@/components/ui/badge";
import { LIVE_STALE_THRESHOLD_MS } from "@/lib/sen/constants";
import {
  dataAgeMs,
  formatDateTime,
  formatLastUpdatedLabel,
  formatRelative,
} from "@/lib/sen/format";
import type { SenSummaryResponse } from "@/lib/sen/types";

interface HeaderProps {
  summary: SenSummaryResponse | undefined;
  /**
   * Timestamp-ul valorilor INSTANT (/sen-filter) — când există, badge-ul și
   * textul de prospețime folosesc ORA REAL-TIME (secunde vechi), nu ultima
   * înregistrare a seriei istorice (~10 min). La eșec instant → null → se
   * folosește summary.latest (comportamentul de dinainte).
   */
  liveAt?: string | undefined;
}

/**
 * Antet sticky: titlu, sursa datelor, badge "live" și ora ultimei înregistrări.
 * Dacă ultima înregistrare e mai veche decât pragul de prospețime
 * (`LIVE_STALE_THRESHOLD_MS` — fetch-ul live a eșuat → fallback pe arhivă),
 * badge-ul devine avertisment vizibil, nu mai arată ca „live".
 * Conține și comutatorul de temă.
 */
export function Header({ summary, liveAt }: HeaderProps) {
  const latestIso = liveAt ?? summary?.latest?.t;
  const lastUpdated = latestIso ? formatDateTime(latestIso, { withYear: true }) : "—";
  const now = Date.now();
  const relative = latestIso ? formatRelative(latestIso, now) : null;
  const isStale = latestIso ? dataAgeMs(latestIso, now) > LIVE_STALE_THRESHOLD_MS : false;

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
                {" · "}
                {isStale ? (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    live indisponibil — date din {lastUpdated}
                  </span>
                ) : (
                  <>actualizat {relative}</>
                )}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {latestIso && (
            <Badge
              variant="secondary"
              role="status"
              className={`hidden gap-1.5 border backdrop-blur-xs sm:flex ${
                isStale
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-primary/20 bg-primary/10 text-primary"
              }`}
              aria-label={
                isStale
                  ? `Date vechi — ultima înregistrare din ${lastUpdated}`
                  : formatLastUpdatedLabel(relative ?? "")
              }
            >
              {isStale ? (
                <TriangleAlert className="h-3 w-3" />
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
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
