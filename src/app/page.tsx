"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { BalanceChart } from "@/components/dashboard/balance-chart";
import { ChartSummary } from "@/components/dashboard/chart-summary";
import { DataTable } from "@/components/dashboard/data-table";
import { DemandSupplyChart } from "@/components/dashboard/demand-supply-chart";
import { Filters, RANGE_PRESETS } from "@/components/dashboard/filters";
import { Footer } from "@/components/dashboard/footer";
import { GlobalHoverSync } from "@/components/dashboard/global-hover-sync";
import { Header } from "@/components/dashboard/header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ProductionMixChart } from "@/components/dashboard/production-mix-chart";
import { RangePicker } from "@/components/dashboard/range-picker";
import { SectionCard } from "@/components/dashboard/section-card";
import { SourceDistribution } from "@/components/dashboard/source-distribution";
import { SourceLegend } from "@/components/dashboard/source-legend";
import { StorageCard } from "@/components/dashboard/storage-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstantData } from "@/hooks/use-instant-data";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { useSenCosts } from "@/hooks/use-sen-costs";
import { useSenData, useSenSummary } from "@/hooks/use-sen-data";
import { intervalStats } from "@/lib/sen/costs";
import { SOURCE_ORDER } from "@/lib/sen/constants";
import {
  customRangeToBoundaries,
  formatEurMillions,
  formatNumber,
  formatRangeLabel,
} from "@/lib/sen/format";
import {
  GRANULARITIES,
  granularitiesForPreset,
  type Granularity,
  type SenReading,
} from "@/lib/sen/types";

const PRESET_IDS = RANGE_PRESETS.map((p) => p.id);

/** Interval personalizat ales din calendar (ISO date, YYYY-MM-DD). */
interface CustomRange {
  from: string;
  to: string;
}

const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// useLocalPreference cere `T extends string` — stocăm intervalul serializat
// („YYYY-MM-DD|YYYY-MM-DD") și îl parsam la citire.
const CUSTOM_RANGE_SERIALIZED = (r: CustomRange | undefined) => (r ? `${r.from}|${r.to}` : "");
const parseCustomRange = (s: string): CustomRange | undefined => {
  const [from, to] = s.split("|");
  if (from && to && isDateStr(from) && isDateStr(to)) return { from, to };
  return undefined;
};

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
  const instantQuery = useInstantData();
  const instant = instantQuery.data ?? undefined;

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
  // Interval personalizat (calendar): persistă serializat („YYYY-MM-DD|YYYY-MM-DD").
  const [customRangeRaw, setCustomRangeRaw] = useLocalPreference<string>(
    "sen:custom-range",
    "",
    (v: string): v is string => v === "" || parseCustomRange(v) !== undefined,
  );
  const customRange = useMemo(() => parseCustomRange(customRangeRaw), [customRangeRaw]);

  const sortedSources = useMemo(() => {
    if (!summary?.latest) return SOURCE_ORDER;
    const latest = summary.latest;
    return [...SOURCE_ORDER].sort((a, b) => (latest[b] ?? 0) - (latest[a] ?? 0));
  }, [summary]);

  /**
   * „Ultima înregistrare” afișată: când valorile INSTANT (/sen-filter) există,
   * le suprapunem peste summary.latest (KPI + Mixul curent arată starea
   * real-time); la eșec instant → summary.latest (fallback lin, fără crash).
   */
  const liveLatest = useMemo<SenReading | undefined>(() => {
    if (!summary?.latest) return undefined;
    if (!instant) return summary.latest;
    return {
      ...summary.latest,
      t: instant.t,
      ts: instant.ts,
      consum: instant.consum,
      productie: instant.productie,
      sold: instant.sold,
      carbune: instant.carbune,
      hidrocarburi: instant.hidrocarburi,
      ape: instant.ape,
      nuclear: instant.nuclear,
      eolian: instant.eolian,
      foto: instant.foto,
      biomasa: instant.biomasa,
    };
  }, [summary, instant]);

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
    if (preset === "custom") return; // granularitatea rămâne ce e (utilizatorul alege)
    // 24h e prea scurt pentru zi; interval mare e prea dens pentru raw/10m
    setGranularity(resolveGranularity(preset, granularity));
  }

  /** Interval personalizat ales din calendar: salvează + trece pe preset-ul „custom". */
  function handleCustomRangeChange(fromTs: number, toTs: number) {
    const d1 = new Date(fromTs);
    const d2 = new Date(toTs);
    const iso = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`;
    setCustomRangeRaw(CUSTOM_RANGE_SERIALIZED({ from: iso(d1), to: iso(d2) }));
    setActivePreset("custom");
  }

  const { from, to } = useMemo(() => {
    if (!endTs) return { from: 0, to: 0 };
    if (activePreset === "custom") {
      // Granițe UTC (contract fake-UTC): ziua aleasă = [00:00, 23:59:59.999],
      // clampate la datele disponibile — logica pură în format.ts (testată).
      const bounds = customRangeToBoundaries(customRange, startTs, endTs);
      if (bounds) return bounds;
    }
    const preset = RANGE_PRESETS.find((p) => p.id === activePreset) ?? RANGE_PRESETS[2];
    const fromTs = preset.msBack === null ? startTs : Math.max(startTs, endTs - preset.msBack);
    return { from: fromTs, to: endTs };
  }, [activePreset, customRange, endTs, startTs]);

  const dataQuery = useSenData(from || undefined, to || undefined, effectiveGranularity);
  const points = dataQuery.data?.points ?? [];
  const costsQuery = useSenCosts(from || undefined, to || undefined);
  const costs = costsQuery.data?.costs;

  const renewableShare = dataQuery.data?.summary.renewableShareAvg;

  // Footer „Consum vs. Producție”: statistici simple pe interval, calculate din
  // punctele deja încărcate (fără prețuri) — păstrează simetria cu cardul
  // „Balanța” (care primește costurile) în grid-ul lg:grid-cols-2.
  const chartStats = useMemo(() => intervalStats(points), [points]);

  // Contextul perioadei pentru footer-urile celor două carduri: eticheta
  // preset-ului activ (ex: „7 zile”) + intervalul real (ex: „8–15 aug”). Fără
  // acest rând, valorile (costuri / medii) nu au un termen de referință clar.
  const rangeContext = useMemo(() => {
    if (!endTs) return undefined;
    const preset = RANGE_PRESETS.find((p) => p.id === activePreset) ?? RANGE_PRESETS[2];
    const presetLabel =
      activePreset === "all"
        ? "Tot intervalul"
        : activePreset === "custom"
          ? "Personalizat"
          : `Ultimele ${preset.label.toLowerCase()}`;
    return `${presetLabel} · ${formatRangeLabel(from, to)}`;
  }, [activePreset, endTs, from, to]);

  // Eticheta compactă pentru selectorul de perioadă din header-ul cardurilor:
  // preset-urile afișează numele scurt („7 zile”), intervalul personalizat
  // afișează datele reale („9–13 aug 2026”).
  const rangePickerLabel = useMemo(() => {
    if (activePreset === "custom" && from > 0 && to > 0) return formatRangeLabel(from, to);
    const preset = RANGE_PRESETS.find((p) => p.id === activePreset) ?? RANGE_PRESETS[2];
    return preset.label;
  }, [activePreset, from, to]);

  // Selector de perioadă partajat de cele două carduri pereche (Consum vs
  // Producție + Balanța) — același handler ca bara de filtre, deci starea e
  // sincronă oriunde schimbi intervalul.
  const rangePickerActions = summary ? (
    <RangePicker
      activePreset={activePreset}
      from={from}
      to={to}
      startTs={startTs}
      endTs={endTs}
      label={rangePickerLabel}
      onPresetChange={handlePresetChange}
      onCustomRangeChange={handleCustomRangeChange}
    />
  ) : undefined;

  return (
    <div className="bg-aura-light dark:bg-aura-dark flex min-h-screen flex-col bg-background">
      <GlobalHoverSync />
      <Header summary={summary} liveAt={instant?.t} />

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
              onCustomRangeChange={handleCustomRangeChange}
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
        {summary && (
          <KpiCards summary={summary} renewableShare={renewableShare} latestOverride={liveLatest} />
        )}

        {/* Grid principal: producție pe surse (mare) + distribuție curentă (sidebar) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard
            title="Producția pe surse de energie"
            subtitle="Mixul de producție (arie stivuită) vs. consum (linie punctată)"
            className="lg:col-span-2"
            chartHeight={360}
            // Se întinde să umple rândul (min-height 360, crește când coloana
            // laterală Mixul curent + Stocare e mai înaltă) — altfel ar rămâne
            // la 360px fix cu gol dedesubt.
            stretch
          >
            {dataQuery.isLoading ? (
              <ChartSkeleton />
            ) : dataQuery.error ? (
              <ChartError />
            ) : (
              <ProductionMixChart points={points} granularity={effectiveGranularity} />
            )}
          </SectionCard>

          {/* Coloana laterală: Mixul curent + Stocare (ISPOZ) — seria se
              construiește prin capturi orare (workflow storage-capture). */}
          <div className="flex flex-col gap-4">
            <SectionCard
              title="Mixul curent"
              subtitle="Defalcarea producției la ultima înregistrare"
              chartHeight={360}
              contentClassName="!h-auto"
            >
              <SourceDistribution latest={liveLatest} />
            </SectionCard>
            <StorageCard />
          </div>
        </div>

        {/* Legendă comună surse */}
        <SourceLegend sortedSources={sortedSources} />

        {/* Consum vs Producție + Balanță */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard
            title="Consum vs. Producție"
            subtitle="Cererea și oferta de energie în intervalul selectat"
            chartHeight={300}
            actions={rangePickerActions}
            footer={
              <ChartSummary
                title={rangeContext}
                cells={[
                  {
                    label: "Media consum",
                    value: `${formatNumber(chartStats.avgConsum)} MW`,
                  },
                  {
                    label: "Media producție",
                    value: `${formatNumber(chartStats.avgProductie)} MW`,
                  },
                  {
                    label: "Vârf consum",
                    value: `${formatNumber(chartStats.peakConsum)} MW`,
                  },
                ]}
              />
            }
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
            subtitle="Pozitiv = import · Negativ = export"
            chartHeight={300}
            actions={rangePickerActions}
            footer={
              <ChartSummary
                title={rangeContext}
                cells={
                  costs === undefined || !costs.hasPrices
                    ? [
                        { label: "Cost import", value: "—" },
                        { label: "Venit export", value: "—" },
                        { label: "Sold net", value: "—" },
                      ]
                    : [
                        {
                          label: "Cost import",
                          value: formatEurMillions(costs.cost),
                        },
                        {
                          label: "Venit export",
                          value: formatEurMillions(costs.revenue),
                        },
                        {
                          label: "Sold net",
                          value: formatEurMillions(costs.net),
                        },
                      ]
                }
                note={
                  costs !== undefined && !costs.hasPrices
                    ? "Prețuri PZU indisponibile pentru acest interval — afișăm doar volumele."
                    : "Estimare bazată pe prețurile PZU (day-ahead); costul real include intraday și echilibrare."
                }
              />
            }
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
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                max 200 rânduri
              </span>
            }
          >
            <DataTable readings={points} />
          </SectionCard>
        </div>

        {/* Indicator de încărcare discret pentru date */}
        {dataQuery.isFetching && !dataQuery.isLoading && (
          <div className="glass-tooltip fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs shadow-xl">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
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
