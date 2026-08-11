"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { granularityLabel } from "@/lib/sen/format";
import { GRANULARITIES, granularitiesForPreset, type Granularity } from "@/lib/sen/types";
import { cn } from "@/lib/utils";

export interface RangePreset {
  id: string;
  label: string;
  /** Milisecunde în urmă față de capătul din dreapta (endTs). */
  msBack: number | null;
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: "24h", label: "24 ore", msBack: 24 * 3_600_000 },
  { id: "3d", label: "3 zile", msBack: 3 * 24 * 3_600_000 },
  { id: "7d", label: "7 zile", msBack: 7 * 24 * 3_600_000 },
  { id: "30d", label: "30 zile", msBack: 30 * 24 * 3_600_000 },
  { id: "all", label: "Tot intervalul", msBack: null },
];

interface FiltersProps {
  endTs: number;
  startTs: number;
  activePreset: string;
  granularity: Granularity;
  onPresetChange: (preset: string) => void;
  onGranularityChange: (g: Granularity) => void;
  from: number;
  to: number;
}

/**
 * Bară de filtre: preset-uri de interval (24h/3d/7d/30d/toate), selector de
 * granularitate și buton de export CSV. Preset-urile sunt relative la endTs
 * (cea mai recentă înregistrare), nu la now(), pentru a fi relevante față de
 * datele efective.
 */
export function Filters({
  endTs,
  startTs,
  activePreset,
  granularity,
  onPresetChange,
  onGranularityChange,
  from,
  to,
}: FiltersProps) {
  const availableGranularities = granularitiesForPreset(activePreset);

  function handleExport() {
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
    });
    window.open(`/api/sen/export?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="glass-panel flex flex-wrap items-center gap-1 rounded-xl p-1 shadow-2xs">
        {RANGE_PRESETS.map((p) => {
          // Dezactivăm preset-uri care depășesc intervalul disponibil
          const tooLarge = p.msBack !== null && endTs - p.msBack < startTs;
          return (
            <button
              key={p.id}
              type="button"
              disabled={tooLarge}
              onClick={() => onPresetChange(p.id)}
              className={cn(
                "h-8 rounded-lg px-3 text-xs font-medium transition-all duration-200",
                "disabled:cursor-not-allowed disabled:opacity-40",
                activePreset === p.id
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/25 hover:bg-primary/90"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <Select value={granularity} onValueChange={(v) => onGranularityChange(v as Granularity)}>
        <SelectTrigger
          size="sm"
          className="glass-panel h-9 w-[150px] border-border/70 text-xs shadow-2xs backdrop-blur-xs"
        >
          <span className="text-muted-foreground">Granularitate:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="glass-tooltip backdrop-blur-md">
          {GRANULARITIES.map((g) => (
            <SelectItem
              key={g}
              value={g}
              className="text-xs"
              disabled={!availableGranularities.includes(g)}
            >
              {granularityLabel(g)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        className="glass-panel h-9 gap-1.5 border-border/70 text-xs shadow-2xs backdrop-blur-xs hover:border-border hover:bg-accent/50"
        aria-label="Exportă datele din intervalul curent ca CSV"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  );
}
