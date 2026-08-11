"use client";

import { ExternalLink, Github } from "lucide-react";

import { formatDate } from "@/lib/sen/format";
import type { SenSummaryResponse } from "@/lib/sen/types";

interface FooterProps {
  summary: SenSummaryResponse | undefined;
}

/**
 * Footer sticky: atribuirea sursei (Transelectrica), intervalul datelor și
 * note despre proveniență. Se lipește de partea de jos a viewport-ului când
 * conținutul e scurt și este împins natural când conținutul depășește ecranul.
 */
export function Footer({ summary }: FooterProps) {
  const start = summary?.start;
  const end = summary?.end;
  const count = summary?.count;

  return (
    <footer className="mt-auto border-t border-border/50 bg-card/40 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="font-medium text-foreground/80">
            Sistemul Energetic Național — Dashboard
          </span>
          <span className="hidden sm:inline text-muted-foreground/60">·</span>
          <span>
            Sursa datelor:{" "}
            <a
              href="https://www.transelectrica.ro/web/tel/sistemul-energetic-national"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
            >
              Transelectrica
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>

        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          {start && end && (
            <span className="font-mono tabular-nums">
              {formatDate(start)} — {formatDate(end)}
            </span>
          )}
          {count && (
            <>
              <span className="hidden sm:inline text-muted-foreground/60">·</span>
              <span className="font-mono tabular-nums">
                {count.toLocaleString("ro-RO")} înregistrări
              </span>
            </>
          )}
          <span className="hidden sm:inline text-muted-foreground/60">·</span>
          <span className="inline-flex items-center gap-1">
            <Github className="h-3 w-3" />
            Construit cu Next.js · TypeScript · Recharts
          </span>
        </div>
      </div>
    </footer>
  );
}
