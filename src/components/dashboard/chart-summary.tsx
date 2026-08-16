"use client";

/**
 * Rând de rezumat (footer) pentru cardurile de grafice: 3 celule compacte
 * (etichetă + valoare mono). Înălțime fixă + aceeași structură în ambele
 * carduri (Consum vs Producție / Balanța) ca cele două carduri din grid
 * `lg:grid-cols-2` să rămână PERFECT SIMETRICE vizual (decizie de design:
 * un singur card cu rând extra ar lăsa un gol vizibil în celălalt).
 */

interface ChartSummaryCell {
  label: string;
  value: string;
}

interface ChartSummaryProps {
  /** Contextul perioadei (ex: „Ultimele 7 zile · 8–15 aug”) — afișat deasupra
   *  celulelor ca numerele să aibă întotdeauna un termen de referință explicit.
   *  Fără el, valorile (ex: „6,10 mil €”) par „flotante”. */
  title?: string;
  /** Cele 3 celule (etichetă + valoare) afișate stânga → dreapta. */
  cells: ChartSummaryCell[];
  /** Etichetă de onestitate opțională (ex: „estimare bazată pe PZU"). */
  note?: string;
}

export function ChartSummary({ title, cells, note }: ChartSummaryProps) {
  return (
    <div className="mt-3 border-t border-border/50 pt-2.5">
      {title && (
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>
      {note && <p className="mt-1.5 text-[10px] text-muted-foreground/80">{note}</p>}
    </div>
  );
}
