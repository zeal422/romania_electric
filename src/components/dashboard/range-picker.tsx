"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { RANGE_PRESETS } from "@/components/dashboard/filters";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRangeLabel } from "@/lib/sen/format";
import { cn } from "@/lib/utils";

interface RangePickerProps {
  /** Preset-ul activ (id din RANGE_PRESETS, ex: „7d”, „custom”). */
  activePreset: string;
  from: number;
  to: number;
  startTs: number;
  endTs: number;
  /** Etichetă compactă afișată pe buton (ex: „7 zile” / „9–13 aug 2026”). */
  label: string;
  onPresetChange: (preset: string) => void;
  onCustomRangeChange: (from: number, to: number) => void;
}

/**
 * Selector de interval compact, pentru header-ul cardurilor (slotul `actions`
 * al SectionCard). Oferă aceleași preset-uri ca bara de filtre + calendar
 * range pentru interval personalizat — astfel încât fiecare grafic își poate
 * schimba perioada direct de pe card, fără să te întorci sus la filtre.
 */
export function RangePicker({
  activePreset,
  from,
  to,
  startTs,
  endTs,
  label,
  onPresetChange,
  onCustomRangeChange,
}: RangePickerProps) {
  const [open, setOpen] = useState(false);
  // Selecția din calendar e INTERNĂ și curată la fiecare deschidere (la fel ca
  // în Filters): altfel react-day-picker ar prelua range-ul curent și primul
  // click l-ar completa imediat.
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(undefined);

  function pickPreset(id: string) {
    onPresetChange(id);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setCalendarRange(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-[11px] font-medium text-muted-foreground shadow-2xs backdrop-blur-xs transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
            activePreset === "custom" && "border-primary/40 text-foreground",
          )}
          aria-label="Schimbă perioada afișată în acest grafic"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="max-w-[9rem] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="flex flex-col gap-2">
          {/* Preset-uri rapide */}
          <div className="grid grid-cols-2 gap-1">
            {RANGE_PRESETS.filter((p) => p.id !== "custom").map((p) => {
              const tooLarge = p.msBack !== null && endTs - p.msBack < startTs;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={tooLarge}
                  onClick={() => pickPreset(p.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    activePreset === p.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Interval personalizat: calendar range, constrâns la datele disponibile. */}
          <div className="border-t border-border/40 pt-1.5">
            <p className="mb-1 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Interval personalizat
            </p>
            <Calendar
              mode="range"
              selected={calendarRange}
              onSelect={(range) => {
                // În mod „range”, primul click întoarce un range de-o zi
                // (from === to). Îl păstrăm ca început, dar aplicăm/închidem
                // doar când utilizatorul a ales și capătul.
                setCalendarRange(range);
                if (range?.from && range?.to && range.from.getTime() !== range.to.getTime()) {
                  // Granițe UTC (contract fake-UTC): ziua aleasă = ziua întreagă.
                  const f = Date.UTC(
                    range.from.getUTCFullYear(),
                    range.from.getUTCMonth(),
                    range.from.getUTCDate(),
                  );
                  const t = Date.UTC(
                    range.to.getUTCFullYear(),
                    range.to.getUTCMonth(),
                    range.to.getUTCDate(),
                    23,
                    59,
                    59,
                    999,
                  );
                  onCustomRangeChange(f, t);
                  setOpen(false);
                }
              }}
              disabled={[{ before: new Date(startTs), after: new Date(endTs) }]}
              defaultMonth={to > 0 ? new Date(to) : undefined}
            />
          </div>

          <p className="px-1 text-[10px] leading-relaxed text-muted-foreground/80">
            Afișează: {formatRangeLabel(from, to)}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
