# 08 — Harta de căutare (pentru LLM-uri)

> Acest document te ajută să găsești rapid fișierul potrivit. Citește-l primul (după indexul [`00-index.md`](./00-index.md)). Vezi și: [README.md](../README.md) (rădăcină), [AGENTS.md](../AGENTS.md), [01-arhitectura.md](./01-arhitectura.md).

## Dacă vrei să… → deschide fișierul

### Date & logică

| Întrebare                                                       | Fișier                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unde e structura unei înregistrări (ce câmpuri are)?            | [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) — `SenReading`  |
| Cum se agregă datele pe bucket-uri (10m/oră/zi)?                | [`src/lib/sen/aggregate.ts`](../src/lib/sen/aggregate.ts)         |
| Cum se calculează media/statistici/pondere regenerabil/balanță? | [`src/lib/sen/stats.ts`](../src/lib/sen/stats.ts)                 |
| Cum se formatează numerele/datele în ro-RO?                     | [`src/lib/sen/format.ts`](../src/lib/sen/format.ts)               |
| Ce culori/etichete au sursele de energie?                       | [`src/lib/sen/constants.ts`](../src/lib/sen/constants.ts)         |
| De unde citesc serverul datele (JSON)?                          | [`src/lib/sen/loader.ts`](../src/lib/sen/loader.ts)               |
| Ce granularități există?                                        | [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) — `Granularity` |
| Cum se convertește xlsx-ul în JSON?                             | [`scripts/convert-sen.py`](../scripts/convert-sen.py)             |
| Unde sunt datele?                                               | `data/sen-data.json`, `data/sen-summary.json`                     |
| De unde vine fișierul sursă?                                    | `upload/Grafic_SEN.xlsx`                                          |

### API

| Întrebare                       | Fișier                                                                    |
| ------------------------------- | ------------------------------------------------------------------------- |
| Ce face `GET /api/sen`?         | [`src/app/api/sen/route.ts`](../src/app/api/sen/route.ts)                 |
| Ce face `GET /api/sen/summary`? | [`src/app/api/sen/summary/route.ts`](../src/app/api/sen/summary/route.ts) |
| Ce face `GET /api/sen/export`?  | [`src/app/api/sen/export/route.ts`](../src/app/api/sen/export/route.ts)   |
| Cum apelează clientul API-ul?   | [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts)               |

### UI

| Întrebare                                                      | Fișier                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cum e compusă pagina principală?                               | [`src/app/page.tsx`](../src/app/page.tsx)                                                                                                               |
| Cum arată KPI-urile?                                           | [`src/components/dashboard/kpi-cards.tsx`](../src/components/dashboard/kpi-cards.tsx)                                                                   |
| Cum arată graficul principal (mix pe surse)?                   | [`src/components/dashboard/production-mix-chart.tsx`](../src/components/dashboard/production-mix-chart.tsx)                                             |
| Cum arată donut-ul cu mixul curent?                            | [`src/components/dashboard/source-distribution.tsx`](../src/components/dashboard/source-distribution.tsx)                                               |
| Cum arată consum vs producție?                                 | [`src/components/dashboard/demand-supply-chart.tsx`](../src/components/dashboard/demand-supply-chart.tsx)                                               |
| Cum arată balanța import/export?                               | [`src/components/dashboard/balance-chart.tsx`](../src/components/dashboard/balance-chart.tsx)                                                           |
| Cum arată tabelul de date?                                     | [`src/components/dashboard/data-table.tsx`](../src/components/dashboard/data-table.tsx)                                                                 |
| Cum funcționează filtrele (preset-uri, granularitate, export)? | [`src/components/dashboard/filters.tsx`](../src/components/dashboard/filters.tsx)                                                                       |
| Cum funcționează toggle-ul de temă?                            | [`src/components/dashboard/theme-toggle.tsx`](../src/components/dashboard/theme-toggle.tsx) + [`src/hooks/use-mounted.ts`](../src/hooks/use-mounted.ts) |
| Unde e tooltip-ul comun al graficelor?                         | [`src/components/dashboard/chart-tooltip.tsx`](../src/components/dashboard/chart-tooltip.tsx)                                                           |
| Cum sunt providers (tema + React Query)?                       | [`src/components/providers.tsx`](../src/components/providers.tsx)                                                                                       |

### Design & stil

| Întrebare                                                | Fișier                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Unde sunt paletele light/dark?                           | [`src/app/globals.css`](../src/app/globals.css) — `:root` și `.dark` |
| Unde sunt stilurile globale (scrollbar, Recharts, aura)? | [`src/app/globals.css`](../src/app/globals.css)                      |
| Config Tailwind (darkMode, content)?                     | [`tailwind.config.ts`](../tailwind.config.ts)                        |
| Utilitar `cn()` pentru clase?                            | [`src/lib/utils.ts`](../src/lib/utils.ts)                            |

### Teste & tooling

| Întrebare                  | Fișier                                                        |
| -------------------------- | ------------------------------------------------------------- |
| Unde sunt testele unitare? | [`tests/sen/`](../tests/sen/)                                 |
| Cum rulez tot CI-ul?       | `package.json` → scriptul `check`                             |
| Cum verific hidratarea?    | [`scripts/check-hydration.sh`](../scripts/check-hydration.sh) |

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
5. **Culorile surselor doar în `constants.ts`** — nu hardcoda hex în componente.
6. **Granularități doar `raw|10m|hour|day`**.
7. **Timestamps 2026 = fidel, nu „corecta”**.
8. După orice modificare: **`bun run check`**.
