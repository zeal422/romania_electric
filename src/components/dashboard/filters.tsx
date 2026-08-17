"use client";

import { CalendarDays, Download } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customRangeToBoundaries, formatRangeLabel, granularityLabel } from "@/lib/sen/format";
import { toLocalDateKey } from "@/lib/sen/calendar";
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
  // „Personalizat” NU are o fereastră relativă: intervalul vine din datele
  // alese de utilizator (calendar range), stocate de page.tsx. `msBack: null`
  // îl tratează ca „all” în logica de granularitate (orice granularitate merge).
  { id: "custom", label: "Personalizat", msBack: null },
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
  /** Aplică un interval personalizat ales din calendar (epoch ms). */
  onCustomRangeChange: (from: number, to: number) => void;
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
  onCustomRangeChange,
}: FiltersProps) {
  const availableGranularities = granularitiesForPreset(activePreset);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Selecția din calendar (range) e INTERNĂ — la deschidere începe curată,
  // altfel react-day-picker preia range-ul curent (ex: 7 zile) și primul click
  // îl completează imediat (popover-ul s-ar închide din prima zi).
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(undefined);

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

      {/* Interval personalizat: calendar range (react-day-picker), constrâns la
          datele disponibile. La selecție, page.tsx salvează intervalul și trece
          pe preset-ul „custom”. */}
      <Popover
        open={calendarOpen}
        onOpenChange={(open) => {
          setCalendarOpen(open);
          if (open) setCalendarRange(undefined); // selecție curată la fiecare deschidere
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "glass-panel flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-xs font-medium shadow-2xs backdrop-blur-xs transition-all duration-200",
              activePreset === "custom"
                ? "bg-primary text-primary-foreground shadow-xs shadow-primary/25"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {activePreset === "custom" && from > 0 && to > 0
              ? formatRangeLabel(from, to)
              : "Personalizat"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="end">
          <Calendar
            mode="range"
            selected={calendarRange}
            onSelect={(range) => {
              // react-day-picker în mod „range” întoarce la primul click un range
              // de-o zi (from === to). Îl păstrăm ca început (highlight), dar NU
              // aplicăm/închidem decât când utilizatorul a ales și capătul.
              setCalendarRange(range);
              if (range?.from && range?.to && range.from.getTime() !== range.to.getTime()) {
                // Granițe UTC (contract fake-UTC): ziua aleasă = ziua întreagă,
                // clampată la datele disponibile — logica pură în format.ts
                // (testată), aceeași folosită de page.tsx (fix F10).
                // Cheia e din componentele LOCALE (nu toISOString → ziua UTC):
                // react-day-picker dă miezul nopții local, iar la UTC+3 toISOString
                // ar muta ziua aleasă cu una în urmă (fix 0.3.27).
                const bounds = customRangeToBoundaries(
                  {
                    from: toLocalDateKey(range.from),
                    to: toLocalDateKey(range.to),
                  },
                  startTs,
                  endTs,
                );
                if (bounds) {
                  onCustomRangeChange(bounds.from, bounds.to);
                  setCalendarOpen(false);
                }
              }
            }}
            disabled={[{ before: new Date(startTs), after: new Date(endTs) }]}
            defaultMonth={to > 0 ? new Date(to) : undefined}
          />
        </PopoverContent>
      </Popover>

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
