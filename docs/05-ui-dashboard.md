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
   └─ Sidebar: Mixul curent (SourceDistribution) + Stocare (StorageCard)
      └─ Stocare (ISPOZ) — valoare curentă + sparkline + trend
└─ Legendă comună surse (SOURCE_ORDER)
└─ Grid secundar (2 coloane)
   ├─ Consum vs Producție (DemandSupplyChart)
   └─ Balanța (BalanceChart)
└─ Tabel de date brute (DataTable, max 200 rânduri)
Footer (sticky bottom)
```

**Starea din `page.tsx`:**

- `activePreset` (default `"7d"`) și `granularity` (default `"hour"`) — **persistă în localStorage** prin `useLocalPreference` (`src/hooks/use-local-preference.ts`), deci supraviețuiesc refresh-ului.
- `hoveredSource` (gestionat de `useHoverStore` din `src/hooks/use-hover-store.ts`) — sincronizează starea de hover între legenda comună și grafice (`ProductionMixChart`, `SourceDistribution`, `ChartTooltip`). Pentru performanță maximă (60 FPS, fără lag pe re-randare), sincronizarea cu stilurile Recharts folosește un mecanism hibrid: `GlobalHoverSync` injectează atributul `data-hovered-source` pe `<body>`, iar opacitatea/estomparea (`opacity-35` / `fillOpacity`) este gestionată direct din CSS (`globals.css`), izolând complet ciclul de render al paginii.
- `sortedSources` — legenda afișează sursele în ordine descrescătoare a producției curente (pe baza `summary.latest`).
- `from`/`to` calculate din preset relativ la `summary.endTs` (nu `now()`).
- Perechea preset/granularitate e **normalizată și la citirea preferințelor** (nu doar la schimbarea preset-ului): `effectiveGranularity = resolveGranularity(activePreset, granularity)` e folosită pentru query, grafice și UI, ca o pereche incompatibilă stocată anterior (ex: `24h` + `day`) să nu ajungă în `useSenData`.
- Regula de compatibilitate preset→granularitate e **sursă unică** în `granularitiesForPreset(preset)` (exportat din `src/lib/sen/types.ts`, lângă `GRANULARITIES` — logica pură, testată separat): `Filters` **dezactivează** opțiunile incompatibile în dropdown (24h → fără `day`; 30d/all → fără `raw`/`10m`), iar `resolveGranularity` din `page.tsx` folosește aceeași funcție → UI-ul nu mai permite o pereche incompatibilă, iar dacă una veche e stocată, e normalizată la citire.
- Stări de loading/error pentru KPI și grafice (skeleton + alert).

## Componentele din `src/components/dashboard/`

| Componentă           | Fișier                     | Rol                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Header`             | `header.tsx`               | Antet sticky cu glassmorphism (`glass-header`): titlu, link Transelectrica, badge cu ora ultimei înregistrări (`role="status"`, `aria-label`, punct pulsant `animate-ping`), badge cu numărul de puncte, ThemeToggle                                                                                                                                   |
| `Filters`            | `filters.tsx`              | Bară de filtre cu stilizare sticlă (`glass-panel`): preset-uri de interval (`RANGE_PRESETS`: 24h/3d/7d/30d/all, relative la `endTs`) cu butoane stil pastilă neon pe starea activă, selector granularitate (opțiuni incompatibile dezactivate prin `granularitiesForPreset` din `lib/sen/types.ts`), buton export CSV                                  |
| `KpiCards`           | `kpi-cards.tsx`            | 4 carduri cu glassmorphism (`glass-card`), fundal cu glow radial ambiental difuz adaptat pe culorile metricei (roșu/verde/lime/albastru), badge-uri chip pentru iconițe și ridicare smooth la hover (`hover:-translate-y-0.5`). Afișează Consum, Producție, Sold (import/export), Share regenerabil — cu medie/min/max și trend                        |
| `ProductionMixChart` | `production-mix-chart.tsx` | Aria stivuită pe surse (Recharts `Area` cu `stackId`) + linia de consum punctată deasupra. Integrată cu `useHoverStore` și stilizată prin clase CSS (`area-[source]`) hardware-accelerated fără re-randare React la hover. Transmite `showTotals={true}` și `labelFormatter` adaptat la granularitate către `ChartTooltip`                             |
| `SourceDistribution` | `source-distribution.tsx`  | Donut (PieChart) cu mixul la ultima înregistrare + legendă detaliată (MW + %). Integrată cu `useHoverStore` (selectori atomici) și stilizată prin clase CSS (`pie-[source]`)                                                                                                                                                                           |
| `SourceLegend`       | `source-legend.tsx`        | Legendă izolată pentru surse (descrescător după valoarea curentă) deconectată de `page.tsx` pentru a preveni re-randarea paginii la hover                                                                                                                                                                                                              |
| `GlobalHoverSync`    | `global-hover-sync.tsx`    | Componentă invizibilă ce sincronizează `hoveredSource` din store cu atributul `data-hovered-source` de pe `<body>`                                                                                                                                                                                                                                     |
| `StorageCard`        | `storage-card.tsx`         | Mini-card „Stocare" cu glassmorphism (`glass-card`) și glow ambiental violet (`#A582FF`): valoarea curentă ISPOZ (MW), trend față de ultima captură (încărcare/descărcare/stabil) și sparkline SVG cu seria acumulată de capturi orare. Badge-ul reflectă **proveniența** valorii (`current.source`).                                                  |
| `DemandSupplyChart`  | `demand-supply-chart.tsx`  | Două linii: consum vs producție                                                                                                                                                                                                                                                                                                                        |
| `BalanceChart`       | `balance-chart.tsx`        | Aria „sold" cu gradient divergent (roșu import / verde export — semantica oficială `SOLD = CONS − PROD`), `ReferenceLine` la 0, domain calculat din date                                                                                                                                                                                               |
| `DataTable`          | `data-table.tsx`           | Tabel scrollabil (`glass-panel`) cu header sticky translucid cu blur (`bg-card/85 backdrop-blur-md`) și badge-uri colorate pentru sold                                                                                                                                                                                                                 |
| `SectionCard`        | `section-card.tsx`         | Container consistent cu glassmorphism (`glass-card`) pentru grafice (titlu, subtitlu, acțiuni, înălțime fixă pentru `ResponsiveContainer`)                                                                                                                                                                                                             |
| `ChartTooltip`       | `chart-tooltip.tsx`        | Tooltip Recharts cu glassmorphism (`glass-tooltip`), rânduri sortate descrescător, evidențiere rând activ din `useHoverStore`, formatare fidelă a datei după `labelFormatter`/granularitate (eliminând timestamp-ul numeric brut) și suport opțional `showTotals` pentru sumar Producție \| Consum în antet (cu filtrarea rândului duplicat de consum) |
| `ThemeToggle`        | `theme-toggle.tsx`         | Toggle light/dark cu `useMounted()` (vezi mai jos)                                                                                                                                                                                                                                                                                                     |
| `Footer`             | `footer.tsx`               | Footer translucid (`backdrop-blur-md bg-card/40`): sursa datelor, intervalul, numărul de înregistrări                                                                                                                                                                                                                                                  |

## Cum se leagă UI-ul de date

- Componentele **nu** importă `loader.ts` — primesc date prin props de la `page.tsx`, care le ia din hook-uri.
- Hook-urile (`useSenData`, `useSenSummary`) din [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts) fac `fetch` la API (vezi [03-api.md](./03-api.md)).
- `StorageCard` folosește [`src/hooks/use-storage-data.ts`](../src/hooks/use-storage-data.ts) (`useStorageData`, query key `["sen","storage"]`, `staleTime 5 min`) → `GET /api/sen/storage` (vezi [03-api.md](./03-api.md) §storage).
- **Stocarea și granularitatea**: seria e capturată **orar** (workflow `storage-capture`), deci la granularitate `10m` în grafice cardul afișează punctele orare — nu există date de 10 minute pentru ISPOZ în sursă.
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
