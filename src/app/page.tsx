"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { BalanceChart } from "@/components/dashboard/balance-chart";
import { DataTable } from "@/components/dashboard/data-table";
import { DemandSupplyChart } from "@/components/dashboard/demand-supply-chart";
import { Filters, RANGE_PRESETS } from "@/components/dashboard/filters";
import { Footer } from "@/components/dashboard/footer";
import { Header } from "@/components/dashboard/header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ProductionMixChart } from "@/components/dashboard/production-mix-chart";
import { SectionCard } from "@/components/dashboard/section-card";
import { SourceDistribution } from "@/components/dashboard/source-distribution";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { useSenData, useSenSummary } from "@/hooks/use-sen-data";
import { SOURCE_ORDER, SOURCES } from "@/lib/sen/constants";
import { GRANULARITIES, granularitiesForPreset, type Granularity } from "@/lib/sen/types";

const PRESET_IDS = RANGE_PRESETS.map((p) => p.id);

// Validatori stabili la nivel de modul: `isValid` trebuie să fie aceeași
// referință între randări ca `getSnapshot` (useCallback) să nu se recreeze
// inutil la fiecare render.
const isPresetId = (v: string): v is string => PRESET_IDS.includes(v);

function isGranularity(v: string): v is Granularity {
  return (GRANULARITIES as string[]).includes(v);
}

export default function Home() {
  const summaryQuery = useSenSummary();
  const summary = summaryQuery.data;

  // Preferințele de filtrare persistă în localStorage (revine la ele la refresh).
  const [activePreset, setActivePreset] = useLocalPreference<string>(
    "sen:preset",
    "7d",
    isPresetId,
  );
  const [granularity, setGranularity] = useLocalPreference<Granularity>(
    "sen:granularity",
    "hour",
    isGranularity,
  );

  const endTs = summary?.endTs ?? 0;
  const startTs = summary?.startTs ?? 0;

  /** Ajustează granularitatea la o valoare compatibilă cu preset-ul (persistată). */
  function resolveGranularity(preset: string, g: Granularity): Granularity {
    // Sursă unică cu `Filters` (care dezactivează opțiunile incompatibile).
    return granularitiesForPreset(preset).includes(g) ? g : "hour";
  }

  // Normalizează perechea preset/granularitate imediat după citirea preferințelor:
  // localStorage poate conține o pereche incompatibilă (ex: 24h + day stocată
  // înainte de existența protecției), așa că aplicăm aceeași regulă ca la
  // schimbarea preset-ului și o folosim pentru query + grafice + UI.
  const effectiveGranularity = resolveGranularity(activePreset, granularity);

  /** Schimbă preset-ul de interval, ajustând granularitatea dacă e incompatibilă. */
  function handlePresetChange(preset: string) {
    setActivePreset(preset);
    // 24h e prea scurt pentru zi; interval mare e prea dens pentru raw/10m
    setGranularity(resolveGranularity(preset, granularity));
  }

  const { from, to } = useMemo(() => {
    if (!endTs) return { from: 0, to: 0 };
    const preset = RANGE_PRESETS.find((p) => p.id === activePreset) ?? RANGE_PRESETS[2];
    const fromTs = preset.msBack === null ? startTs : Math.max(startTs, endTs - preset.msBack);
    return { from: fromTs, to: endTs };
  }, [activePreset, endTs, startTs]);

  const dataQuery = useSenData(from || undefined, to || undefined, effectiveGranularity);
  const points = dataQuery.data?.points ?? [];

  const renewableShare = dataQuery.data?.summary.renewableShareAvg;

  return (
    <div className="bg-aura-light dark:bg-aura-dark flex min-h-screen flex-col bg-background">
      <Header summary={summary} />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
        {/* Bară de filtre */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Panou de monitorizare</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {activePreset === "all" ? "tot intervalul" : activePreset}
            </span>
          </div>
          {summary && (
            <Filters
              endTs={endTs}
              startTs={startTs}
              activePreset={activePreset}
              granularity={effectiveGranularity}
              onPresetChange={handlePresetChange}
              onGranularityChange={setGranularity}
              from={from}
              to={to}
            />
          )}
        </div>

        {/* KPI cards */}
        {summaryQuery.isLoading && <KpiSkeleton />}
        {summaryQuery.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Eroare</AlertTitle>
            <AlertDescription>
              Nu am putut încărca datele sumare. Încearcă din nou mai târziu.
            </AlertDescription>
          </Alert>
        )}
        {summary && <KpiCards summary={summary} renewableShare={renewableShare} />}

        {/* Grid principal: producție pe surse (mare) + distribuție curentă (sidebar) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard
            title="Producția pe surse de energie"
            subtitle="Mixul de producție (arie stivuită) vs. consum (linie punctată)"
            className="lg:col-span-2"
            chartHeight={360}
          >
            {dataQuery.isLoading ? (
              <ChartSkeleton />
            ) : dataQuery.error ? (
              <ChartError />
            ) : (
              <ProductionMixChart points={points} granularity={effectiveGranularity} />
            )}
          </SectionCard>

          <SectionCard
            title="Mixul curent"
            subtitle="Defalcarea producției la ultima înregistrare"
            chartHeight={360}
            contentClassName="!h-auto"
          >
            <SourceDistribution latest={summary?.latest} />
          </SectionCard>
        </div>

        {/* Legendă comună surse */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Surse:
          </span>
          {SOURCE_ORDER.map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SOURCES[f].color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{SOURCES[f].label}</span>
            </span>
          ))}
        </div>

        {/* Consum vs Producție + Balanță */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard
            title="Consum vs. Producție"
            subtitle="Cererea și oferta de energie în intervalul selectat"
            chartHeight={300}
          >
            {dataQuery.isLoading ? (
              <ChartSkeleton />
            ) : dataQuery.error ? (
              <ChartError />
            ) : (
              <DemandSupplyChart points={points} granularity={effectiveGranularity} />
            )}
          </SectionCard>

          <SectionCard
            title="Balanța energetică (Sold)"
            subtitle="Pozitiv = export · Negativ = import"
            chartHeight={300}
          >
            {dataQuery.isLoading ? (
              <ChartSkeleton />
            ) : dataQuery.error ? (
              <ChartError />
            ) : (
              <BalanceChart points={points} granularity={effectiveGranularity} />
            )}
          </SectionCard>
        </div>

        {/* Tabel de date */}
        <div className="mt-4">
          <SectionCard
            title="Înregistrări brute"
            subtitle="Cele mai recente citiri la intervale de 10 minute"
            chartHeight={0}
            contentClassName="!h-auto"
            actions={
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                max 200 rânduri
              </span>
            }
          >
            <DataTable readings={points} />
          </SectionCard>
        </div>

        {/* Indicator de încărcare discret pentru date */}
        {dataQuery.isFetching && !dataQuery.isLoading && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-muted-foreground">Actualizez…</span>
          </div>
        )}
      </main>

      <Footer summary={summary} />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/70 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-8 w-28" />
          <Skeleton className="mt-3 h-px w-full" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ChartError() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Alert variant="destructive" className="max-w-sm">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Nu am putut încărca datele pentru acest grafic.</AlertDescription>
      </Alert>
    </div>
  );
}
