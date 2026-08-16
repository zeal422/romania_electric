"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Înălțimea zonei de chart. Default 320px. */
  chartHeight?: number;
  /** Dacă true, zona de chart se ÎNTINDE să umple înălțimea rândului
   *  (min-height = chartHeight în loc de height fix) — pentru carduri din
   *  rânduri cu coloane laterale înalte (ex: „Producția pe surse" lângă
   *  sidebar). Fără el, cardul rămâne la chartHeight fix și lasă gol sub grafic. */
  stretch?: boolean;
  className?: string;
  contentClassName?: string;
  /** Conținut opțional randat SUB zona de chart (ex: rând de rezumat — vezi
   *  chart-summary.tsx). Folosit de cardurile pereche (Consum vs Producție /
   *  Balanța) ca ambele să rămână simetrice vizual în grid-ul lg:grid-cols-2. */
  footer?: React.ReactNode;
}

/**
 * Container de secțiune consistent pentru grafice: titlu, subtitlu opțional,
 * acțiuni în dreapta și o zonă de conținut cu înălțime fixă pentru chart-uri
 * (ResponsiveContainer are nevoie de o înălțime determinată).
 */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  chartHeight = 320,
  stretch = false,
  className,
  contentClassName,
  footer,
}: SectionCardProps) {
  return (
    <Card
      className={cn(
        "glass-card flex flex-col p-4 transition-all duration-300 hover:border-border/80 hover:shadow-md",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {/* Mod implicit (stretch=false): height fix + shrink-0. FĂRĂ flex-1, căci
          `flex: 1 0 0%` pune flex-basis la 0%, iar `height` inline devine
          irelevant ca bază — flexul distribuie spațiul rămas după
          header/footer, iar dacă grid-ul calculează rândul pe baza conținutului
          textului, chart-ul se comprimă la ~21px (SVG colapsat, „linie
          verticală”). height fix + shrink-0 garantează că zona de chart are
          mereu exact chartHeight și cardul/rândul cresc să o încapă.

          Mod stretch: flex-1 + min-height = chartHeight. Flex-basis 0% ar
          contribui 0 la înălțimea rândului, dar min-height îl împiedică să se
          comprime sub chartHeight — iar când rândul e mai înalt (ex: coloana
          laterală cu Stocare), zona se întinde să-l umple. Fără min-height,
          chart-ul s-ar bloca la 21px ca în bug-ul de dinainte. */}
      <div
        className={cn(stretch ? "min-w-0 flex-1" : "min-w-0 shrink-0", contentClassName)}
        style={stretch ? { minHeight: chartHeight } : { height: chartHeight }}
      >
        {children}
      </div>
      {footer}
    </Card>
  );
}
