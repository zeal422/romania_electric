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
  className?: string;
  contentClassName?: string;
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
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("flex flex-col border-border/70 p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("min-w-0 flex-1", contentClassName)} style={{ height: chartHeight }}>
        {children}
      </div>
    </Card>
  );
}
