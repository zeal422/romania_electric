"use client";

import { useHoverStore } from "@/hooks/use-hover-store";
import { SERIES_COLORS, SOURCES } from "@/lib/sen/constants";
import type { SourceField } from "@/lib/sen/types";

interface SourceLegendProps {
  sortedSources: SourceField[];
}

export function SourceLegend({ sortedSources }: SourceLegendProps) {
  const hoveredSource = useHoverStore((state) => state.hoveredSource);
  const setHoveredSource = useHoverStore((state) => state.setHoveredSource);

  return (
    <div className="glass-panel mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-3.5 py-2.5 shadow-2xs">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Surse (descrescător):
      </span>
      {sortedSources.map((f) => {
        const isHovered = hoveredSource === f;
        const isDimmed = hoveredSource !== null && !isHovered;
        return (
          <button
            type="button"
            key={f}
            onMouseEnter={() => setHoveredSource(f)}
            onMouseLeave={() => setHoveredSource(null)}
            onFocus={() => setHoveredSource(f)}
            onBlur={() => setHoveredSource(null)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-all duration-200 ${
              isHovered ? "bg-accent/80 font-medium text-foreground scale-105" : ""
            } ${isDimmed ? "opacity-35" : "opacity-100"}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm shadow-2xs"
              style={{ backgroundColor: SOURCES[f].color }}
              aria-hidden
            />
            <span className="text-muted-foreground hover:text-foreground">{SOURCES[f].label}</span>
          </button>
        );
      })}
      {/* Consum: nu e o sursă (nu are hover pe arii), deci e un element static,
          nu un buton — dar stă în aceeași legendă, ca restul seriilor. Linia
          punctată cu culoarea seriei (SERIES_COLORS.consum). */}
      <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs">
        <span
          className="inline-block h-0 w-2.5 border-t-2"
          style={{ borderColor: SERIES_COLORS.consum, borderStyle: "dashed" }}
          aria-hidden
        />
        <span className="text-muted-foreground">Consum</span>
      </span>
    </div>
  );
}
