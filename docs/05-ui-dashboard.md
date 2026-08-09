# 05 — UI Dashboard

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [06-design.md](./06-design.md) · [03-api.md](./03-api.md)

## Structura paginii

**`src/app/page.tsx`** (`"use client"`) — compune întregul dashboard:

```
Header (sticky, cu ora ultimei înregistrări + ThemeToggle)
└─ Filters bar (preset interval + granularitate + export CSV)
└─ KPI cards (4)
└─ Grid principal (lg: 2 coloane mari + 1 sidebar)
   ├─ Producția pe surse  (ProductionMixChart)   [2 coloane]
   └─ Mixul curent        (SourceDistribution)   [1 coloană]
└─ Legendă comună surse (SOURCE_ORDER)
└─ Grid secundar (2 coloane)
   ├─ Consum vs Producție (DemandSupplyChart)
   └─ Balanța (BalanceChart)
└─ Tabel de date brute (DataTable, max 200 rânduri)
Footer (sticky bottom)
```

**Starea din `page.tsx`:**

- `activePreset` (default `"7d"`) și `granularity` (default `"hour"`) — **persistă în localStorage** prin `useLocalPreference` (`src/hooks/use-local-preference.ts`), deci supraviețuiesc refresh-ului.
- `from`/`to` calculate din preset relativ la `summary.endTs` (nu `now()`).
- Perechea preset/granularitate e **normalizată și la citirea preferințelor** (nu doar la schimbarea preset-ului): `effectiveGranularity = resolveGranularity(activePreset, granularity)` e folosită pentru query, grafice și UI, ca o pereche incompatibilă stocată anterior (ex: `24h` + `day`) să nu ajungă în `useSenData`.
- Regula de compatibilitate preset→granularitate e **sursă unică** în `granularitiesForPreset(preset)` (exportat din `src/lib/sen/types.ts`, lângă `GRANULARITIES` — logica pură, testată separat): `Filters` **dezactivează** opțiunile incompatibile în dropdown (24h → fără `day`; 30d/all → fără `raw`/`10m`), iar `resolveGranularity` din `page.tsx` folosește aceeași funcție → UI-ul nu mai permite o pereche incompatibilă, iar dacă una veche e stocată, e normalizată la citire.
- Stări de loading/error pentru KPI și grafice (skeleton + alert).

## Componentele din `src/components/dashboard/`

| Componentă           | Fișier                     | Rol                                                                                                                                                                                                       |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`             | `header.tsx`               | Antet sticky: titlu, link Transelectrica, badge cu ora ultimei înregistrări (`role="status"` + `aria-label` „Ultima înregistrare, actualizată …", punct pulsant), badge cu numărul de puncte, ThemeToggle |     | `Filters` | `filters.tsx` | Preset-uri de interval (`RANGE_PRESETS`: 24h/3d/7d/30d/all, relative la `endTs`), selector granularitate (opțiuni incompatibile dezactivate prin `granularitiesForPreset` din `lib/sen/types.ts`), buton export CSV |
| `KpiCards`           | `kpi-cards.tsx`            | 4 carduri: Consum, Producție, Sold (import/export), Share regenerabil — cu medie/min/max și trend față de medie                                                                                           |
| `ProductionMixChart` | `production-mix-chart.tsx` | Aria stivuită pe surse (Recharts `Area` cu `stackId`) + linia de consum punctată deasupra                                                                                                                 |
| `SourceDistribution` | `source-distribution.tsx`  | Donut (PieChart) cu mixul la ultima înregistrare + legendă detaliată (MW + %)                                                                                                                             |
| `DemandSupplyChart`  | `demand-supply-chart.tsx`  | Două linii: consum vs producție                                                                                                                                                                           |
| `BalanceChart`       | `balance-chart.tsx`        | Aria „sold" cu gradient divergent (roșu import / verde export — semantica oficială `SOLD = CONS − PROD`), `ReferenceLine` la 0, domain calculat din date                                                  |
| `DataTable`          | `data-table.tsx`           | Tabel scrollabil cu cele mai recente 200 înregistrări, badge-uri colorate pentru sold                                                                                                                     |
| `SectionCard`        | `section-card.tsx`         | Container consistent pentru grafice (titlu, subtitlu, acțiuni, înălțime fixă pentru `ResponsiveContainer`)                                                                                                |
| `ChartTooltip`       | `chart-tooltip.tsx`        | Tooltip Recharts stilizat, rânduri sortate descrescător, label ISO → `"8 aug, 18:07"`                                                                                                                     |
| `ThemeToggle`        | `theme-toggle.tsx`         | Toggle light/dark cu `useMounted()` (vezi mai jos)                                                                                                                                                        |
| `Footer`             | `footer.tsx`               | Sursa datelor, intervalul, numărul de înregistrări                                                                                                                                                        |

## Cum se leagă UI-ul de date

- Componentele **nu** importă `loader.ts` — primesc date prin props de la `page.tsx`, care le ia din hook-uri.
- Hook-urile (`useSenData`, `useSenSummary`) din [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts) fac `fetch` la API (vezi [03-api.md](./03-api.md)).
- Graficele primesc `AggregatedPoint[]` gata-agregate + `granularity` pentru formatarea axelor.
- **Toate etichetele sunt în română.** Nu introduce text în engleză în UI.

## Hidratarea și tema (important pentru agenți)

**`src/hooks/use-mounted.ts`** — implementează `useMounted()` cu `useSyncExternalStore`:

- `getServerSnapshot` → `false`, `getSnapshot` → `true`.
- La SSR și la **prima hidratare** React folosește snapshot-ul de server → output identic → **fără mismatch de hidratare**; apoi trece la snapshot-ul client și re-randează.
- **De ce nu `useEffect`**: regula `react-hooks/set-state-in-effect` interzice `setMounted(true)` în effect; `useSyncExternalStore` e modul canonic.

**`ThemeToggle`** folosește `useMounted()` pentru `aria-label` corect (tema reală nu e cunoscută pe server). Iconițele Sun/Moon sunt conduse de clase CSS `dark:` (clasa e pusă pe `<html>` de next-themes înainte de hidratare) → nu pâlpâie.

**`src/hooks/use-local-preference.ts`** — `useLocalPreference(key, defaultValue, isValid?)` pentru preferințe persistente (granularitate, preset):

- Folosește `useSyncExternalStore` (același pattern canonic ca `useMounted`) → **fără hydration mismatch**: pe server returnează `defaultValue`, pe client citește din `localStorage` abia la prima hidratare.
- Stochează **string-uri brute** (nu JSON) și validează la citire prin `isValid` — **type predicate** `(v: string) => v is T`, nu `(v) => boolean` (ex: granularități vechi după o schimbare de enum → `defaultValue`).
- Scrie în `localStorage` direct în handler (nu în `useEffect`) — respectă `react-hooks/set-state-in-effect`.
- `localStorage` indisponibil (sandbox, iframe fără permisiuni, storage blocat): citirea e în `try/catch` → `defaultValue`; scrierea eșuată e ignorată în tăcere (fără `StorageEvent` dispatch).
- Logica de citire/scriere (protecția la excepții inclusă) e **extrasă în funcții pure** în [`src/lib/local-preference.ts`](../src/lib/local-preference.ts) (`readLocalPreference`/`writeLocalPreference`, storage injectat) — testate separat fără DOM (vezi [07-testing-ci.md](./07-testing-ci.md)); hook-ul e doar wrapper subțire. **Tipuri:** fără validator, `readLocalPreference` întoarce `string` (valoarea stocată nu e garantată a fi din setul lui `T` — nu mintim tipul); cu validator type predicate întoarce `T` confirmat. Callerii serioși trec un validator.
- Validatorii trebuie să fie **stabili** (definiți la nivel de modul, nu inline în render) ca `getSnapshot` (useCallback cu dep `[key, fallback, isValid]`) să nu se recreeze inutil la fiecare randare — ex: `isPresetId`/`isGranularity` în `page.tsx`.

**Configurare temă** (`providers.tsx`): `defaultTheme="dark"`, `enableSystem`, `disableTransitionOnChange`. Layout-ul are `lang="ro"` și `suppressHydrationWarning`.

## Responsive & accesibilitate

- Grid-uri responsive: 1 coloană mobil → 2 (sm) → 3–4 (lg).
- Tabel cu scroll vertical (`max-h-[28rem]`), header sticky.
- Badge-uri cu text de culoare pe fundal semi-transparent (contrast OK pe ambele teme).
- `aria-label` pe butoane (export, theme), `sr-only` unde e nevoie.
