# 08 — Harta de căutare (pentru LLM-uri)

> Acest document te ajută să găsești rapid fișierul potrivit. Citește-l primul (după indexul [`00-index.md`](./00-index.md)). Vezi și: [README.md](../README.md) (rădăcină), [AGENTS.md](../AGENTS.md), [01-arhitectura.md](./01-arhitectura.md).

## Dacă vrei să… → deschide fișierul

### Date & logică

| Întrebare                                                           | Fișier                                                                                                                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unde e structura unei înregistrări (ce câmpuri are)?                | [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) — `SenReading`                                                                                                                                   |
| Cum se agregă datele pe bucket-uri (10m/oră/zi)?                    | [`src/lib/sen/aggregate.ts`](../src/lib/sen/aggregate.ts)                                                                                                                                          |
| Cum se calculează media/statistici/pondere regenerabil/balanță?     | [`src/lib/sen/stats.ts`](../src/lib/sen/stats.ts)                                                                                                                                                  |
| Cum se formatează numerele/datele în ro-RO?                         | [`src/lib/sen/format.ts`](../src/lib/sen/format.ts)                                                                                                                                                |
| Cum calculez vârsta reală a unei înregistrări (badge „actualizat")? | `dataAgeMs` + `formatRelative` în [`src/lib/sen/format.ts`](../src/lib/sen/format.ts); pragul de prospețime `LIVE_STALE_THRESHOLD_MS` în [`src/lib/sen/constants.ts`](../src/lib/sen/constants.ts) |
| De unde vine fetch-ul live (serii, timeout/retry/fallback)?         | [`src/lib/sen/live.ts`](../src/lib/sen/live.ts) — server-only (timeout 15s + 1 retry, TTL 10 min, fallback `liveCache` stale 24h / statice)                                                        |
| De unde vin valorile real-time (Consum/Producție/Sold + mix)?       | [`src/lib/sen/instant.ts`](../src/lib/sen/instant.ts) — server-only (TTL 10s + backoff 30s, invariant anti-shift, fallback `null` → summary.latest)                                                |
| Cum se reîmprospătează pagina (polling / revenire pe tab)?          | `refetchOnWindowFocus: true` în [`src/components/providers.tsx`](../src/components/providers.tsx) + `refetchInterval` per hook: instant 30s, summary/storage 60s, grafice 5 min                    |
| Ce culori/etichete au sursele de energie?                           | [`src/lib/sen/constants.ts`](../src/lib/sen/constants.ts)                                                                                                                                          |
| De unde citesc serverul datele (JSON)?                              | [`src/lib/sen/loader.ts`](../src/lib/sen/loader.ts)                                                                                                                                                |
| Ce granularități există?                                            | [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) — `Granularity` + `GRANULARITIES` (sursă unică)                                                                                                  |
| Care sunt granularitățile compatibile cu un preset?                 | `granularitiesForPreset` în [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) (sursă unică UI + normalizare)                                                                                       |
| Cum se convertește xlsx-ul în JSON?                                 | [`scripts/convert-sen.py`](../scripts/convert-sen.py)                                                                                                                                              |
| Unde sunt datele?                                                   | `data/sen-data.json`, `data/sen-summary.json`                                                                                                                                                      |
| De unde vine fișierul sursă?                                        | `upload/Grafic_SEN.xlsx`                                                                                                                                                                           |
| Unde e logica de stocare (ISPOZ)?                                   | [`src/lib/sen/storage.ts`](../src/lib/sen/storage.ts) (server-only) + [`scripts/convert-sen.py`](../scripts/convert-sen.py) `--capture-storage`                                                    |
| Unde e seria capturată de stocare?                                  | `data/sen-storage.json` (generată orar de workflow-ul `storage-capture`)                                                                                                                           |
| De unde vin prețurile PZU (day-ahead)?                              | [`src/lib/sen/prices.ts`](../src/lib/sen/prices.ts) (server-only) + [`scripts/convert-sen.py`](../scripts/convert-sen.py) `--capture-prices` (OPCOM CSV public)                                    |
| Cum se calculează costurile import/export?                          | [`src/lib/sen/costs.ts`](../src/lib/sen/costs.ts) — funcții pure (`computeCosts`, `priceForHour`, `intervalStats`)                                                                                 |
| Unde e seria capturată de prețuri?                                  | `data/sen-prices.json` (generată zilnic de workflow-ul `price-capture`)                                                                                                                            |

### API

| Întrebare                       | Fișier                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ce face `GET /api/sen`?         | [`src/app/api/sen/route.ts`](../src/app/api/sen/route.ts)                                                                                                                                         |
| Ce face `GET /api/sen/summary`? | [`src/app/api/sen/summary/route.ts`](../src/app/api/sen/summary/route.ts)                                                                                                                         |
| Ce face `GET /api/sen/export`?  | [`src/app/api/sen/export/route.ts`](../src/app/api/sen/export/route.ts)                                                                                                                           |
| Ce face `GET /api/sen/storage`? | [`src/app/api/sen/storage/route.ts`](../src/app/api/sen/storage/route.ts)                                                                                                                         |
| Ce face `GET /api/sen/costs`?   | [`src/app/api/sen/costs/route.ts`](../src/app/api/sen/costs/route.ts) — costuri estimate import/export (volume × prețuri PZU)                                                                     |
| Ce face `GET /api/sen/instant`? | [`src/app/api/sen/instant/route.ts`](../src/app/api/sen/instant/route.ts) — valori real-time (`null` la eșec)                                                                                     |
| Cum apelează clientul API-ul?   | [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts) + [`src/hooks/use-instant-data.ts`](../src/hooks/use-instant-data.ts) + [`src/hooks/use-sen-costs.ts`](../src/hooks/use-sen-costs.ts) |

### UI

| Întrebare                                                             | Fișier                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cum e compusă pagina principală?                                      | [`src/app/page.tsx`](../src/app/page.tsx)                                                                                                                                                                           |
| Cum arată KPI-urile?                                                  | [`src/components/dashboard/kpi-cards.tsx`](../src/components/dashboard/kpi-cards.tsx)                                                                                                                               |
| Cum arată graficul principal (mix pe surse)?                          | [`src/components/dashboard/production-mix-chart.tsx`](../src/components/dashboard/production-mix-chart.tsx)                                                                                                         |
| Cum arată donut-ul cu mixul curent?                                   | [`src/components/dashboard/source-distribution.tsx`](../src/components/dashboard/source-distribution.tsx)                                                                                                           |
| Cum arată cardul de stocare (ISPOZ)?                                  | [`src/components/dashboard/storage-card.tsx`](../src/components/dashboard/storage-card.tsx)                                                                                                                         |
| De unde ia cardul de stocare datele?                                  | [`src/hooks/use-storage-data.ts`](../src/hooks/use-storage-data.ts) → `GET /api/sen/storage`                                                                                                                        |
| De unde vin valorile instant în KPI/Mix/Header?                       | [`src/hooks/use-instant-data.ts`](../src/hooks/use-instant-data.ts) → `GET /api/sen/instant` (polling 30s)                                                                                                          |
| Cum arată consum vs producție?                                        | [`src/components/dashboard/demand-supply-chart.tsx`](../src/components/dashboard/demand-supply-chart.tsx)                                                                                                           |
| Cum arată balanța import/export?                                      | [`src/components/dashboard/balance-chart.tsx`](../src/components/dashboard/balance-chart.tsx)                                                                                                                       |
| Unde e rândul de rezumat (footer) al cardurilor pereche?              | [`src/components/dashboard/chart-summary.tsx`](../src/components/dashboard/chart-summary.tsx) (primit prin prop-ul `footer` al `SectionCard`)                                                                       |
| De unde ia cardul „Balanța" costurile?                                | [`src/hooks/use-sen-costs.ts`](../src/hooks/use-sen-costs.ts) → `GET /api/sen/costs`                                                                                                                                |
| Cum arată tabelul de date?                                            | [`src/components/dashboard/data-table.tsx`](../src/components/dashboard/data-table.tsx)                                                                                                                             |
| Cum funcționează filtrele (preset-uri, granularitate, export)?        | [`src/components/dashboard/filters.tsx`](../src/components/dashboard/filters.tsx)                                                                                                                                   |
| Cum schimbi perioada direct pe un card?                               | [`src/components/dashboard/range-picker.tsx`](../src/components/dashboard/range-picker.tsx) — selector compact de perioadă în header-ul cardurilor (preset-uri + calendar range, stare partajată cu bara de filtre) |
| Cum funcționează toggle-ul de temă?                                   | [`src/components/dashboard/theme-toggle.tsx`](../src/components/dashboard/theme-toggle.tsx) + [`src/hooks/use-mounted.ts`](../src/hooks/use-mounted.ts)                                                             |
| Cum persistă preferințele UI (granularitate, preset) în localStorage? | [`src/hooks/use-local-preference.ts`](../src/hooks/use-local-preference.ts) (wrapper React) + [`src/lib/local-preference.ts`](../src/lib/local-preference.ts) (logica pură, testată)                                |
| Unde e tooltip-ul comun al graficelor?                                | [`src/components/dashboard/chart-tooltip.tsx`](../src/components/dashboard/chart-tooltip.tsx)                                                                                                                       |
| Cum sunt providers (tema + React Query)?                              | [`src/components/providers.tsx`](../src/components/providers.tsx)                                                                                                                                                   |

### Design & stil

| Întrebare                                                | Fișier                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Unde sunt paletele light/dark?                           | [`src/app/globals.css`](../src/app/globals.css) — `:root` și `.dark` |
| Unde sunt stilurile globale (scrollbar, Recharts, aura)? | [`src/app/globals.css`](../src/app/globals.css)                      |
| Config Tailwind (darkMode, content)?                     | [`tailwind.config.ts`](../tailwind.config.ts)                        |
| Utilitar `cn()` pentru clase?                            | [`src/lib/utils.ts`](../src/lib/utils.ts)                            |

### Teste & tooling

| Întrebare                  | Fișier                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unde sunt testele unitare? | [`tests/sen/`](../tests/sen/) + [`tests/local-preference.test.ts`](../tests/local-preference.test.ts) + [`tests/storage.test.ts`](../tests/storage.test.ts) + [`tests/capture-storage.test.ts`](../tests/capture-storage.test.ts) + [`tests/capture-prices.test.ts`](../tests/capture-prices.test.ts) |
| Cum rulez tot CI-ul?       | `package.json` → scriptul `check`                                                                                                                                                                                                                                                                     |
| Cum verific hidratarea?    | [`scripts/check-hydration.sh`](../scripts/check-hydration.sh)                                                                                                                                                                                                                                         |

### Documentație

| Întrebare                 | Fișier                              |
| ------------------------- | ----------------------------------- |
| Document public (oameni)? | [`README.md`](../README.md)         |
| Reguli pentru agenți AI?  | [`AGENTS.md`](../AGENTS.md)         |
| Istoric modificări?       | [`CHANGELOG.md`](../CHANGELOG.md)   |
| Index documentație?       | [`docs/00-index.md`](./00-index.md) |

## Reguli esențiale de reținut (detalii în AGENTS.md)

1. **`loader.ts` e server-only** — nu îl importa în componente client.
2. **Logica de date e pură** — nu adăuga side-effects în `aggregate/stats/format`.
3. **Datele din `data/` sunt generate** — nu le edita manual.
4. **UI-ul e în română** — nu introduce text în engleză.
5. **Culorile surselor doar în `constants.ts`** — nu hardcoda hex în componente (inclusiv `STORAGE_COLOR` pentru stocare).
6. **Granularități doar `raw|10m|hour|day`**.
7. **Timestamps 2026 = fidel, nu „corecta”**.
8. După orice modificare: **`bun run check`**.
