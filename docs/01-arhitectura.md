# 01 — Arhitectura generală

> Vezi și: [02-pipeline-date.md](./02-pipeline-date.md) · [03-api.md](./03-api.md) · [04-strat-date.md](./04-strat-date.md) · [05-ui-dashboard.md](./05-ui-dashboard.md) · [06-design.md](./06-design.md)

## Ce este proiectul

Dashboard web pentru **Sistemul Energetic Național (SEN)** al României, construit pe date **Transelectrica**. Afișează consumul și producția de energie defalcate pe surse, balanța import/export și ponderea regenerabilă, la intervale de 10 minute.

- Stack: **Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui + Recharts + TanStack React Query**, rulat cu **Bun**.
- Date: 5.606 înregistrări (01.07.2026 → în prezent), setul crește zilnic prin fetch live Transelectrica (vezi [02-pipeline-date.md](./02-pipeline-date.md)); fișierul istoric e `upload/Grafic_SEN.xlsx`.

## Layerele proiectului

```
┌─────────────────────────────────────────────────────────────┐
│ UI (client)  src/components/dashboard/ + src/hooks/          │
│   React Query (useSenData, useSenSummary) → fetch API       │
├─────────────────────────────────────────────────────────────┤
│ API (server)  src/app/api/sen/*                             │
│   route.ts (agregare) · summary/ (KPI) · export/ (CSV)      │
├─────────────────────────────────────────────────────────────┤
│ Logică pură de date  src/lib/sen/                           │
│   aggregate · stats · format · constants · types            │
│   loader (fișiere, server-only) · live (fetch live, server) │
│   storage (snapshot ISPOZ, server)                          │
├─────────────────────────────────────────────────────────────┤
│ Date statice  data/sen-data.json + sen-summary.json         │
│   (generate de scripts/convert-sen.py: xlsx + fetch live)   │
│   data/sen-storage.json (capturi orare stocare, workflow)   │
└─────────────────────────────────────────────────────────────┘
```

### Regula de aur a layering-ului

- **`src/lib/sen/`** = funcții **pure**, deterministe, tipizate, testate unitar. Fără side-effects, fără `node:fs`, fără React.
- **`src/lib/sen/loader.ts`** = **excepția**: rulează DOAR pe server (citește `data/*.json` cu `node:fs`). Nu importa în cod client.
- **API routes** = strat subțire: parsează query params, cheamă funcțiile pure, întorc JSON/CSV.
- **Hooks** = client-side, comunică cu API prin `fetch`.
- **Componente dashboard** = consumă hook-uri, randează; nu calculează date.

## Fluxul unei cereri (exemplu: utilizator selectează „7 zile, orar")

1. `page.tsx` (client) → `useSenData(from, to, "hour")` din [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts).
2. Hook-ul face `GET /api/sen?from=…&to=…&granularity=hour`.
3. Route-ul din [`src/app/api/sen/route.ts`](../src/app/api/sen/route.ts) → `loadReadings()` (cache singleton) + `filterByRange` + `aggregate` + (la `raw`) `downsample`.
4. Răspunsul JSON ajunge în React Query → componentele randează graficele.

## Decizii cheie de arhitectură

| Decizie                                                                   | Motiv                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date statice JSON + date live la runtime**                              | Istoricul stă în JSON (cache singleton); `live.ts` adaugă datele live Transelectrica cu TTL 10 min și fallback la statice — fără bază de date, simplu și rapid.                                                                                                                                                                                     |
| **`loader.ts` cu cache singleton**                                        | Citirea fișierului se face o singură dată per proces; API-urile devin foarte rapide.                                                                                                                                                                                                                                                                |
| **API-ul agreghează, clientul doar afișează**                             | Clientul primește puncte gata-agregate (raw/10m/oră/zi) — logica e testabilă și identică pentru toate vizualizările.                                                                                                                                                                                                                                |
| **Downsampling la 1.200 puncte** la granularitate `raw` pe intervale mari | Protejează browserul de desenarea a mii de puncte.                                                                                                                                                                                                                                                                                                  |
| **Preset-urile de interval sunt relative la `endTs`**, nu la `now()`      | Datele au capăt variabil (ultima înregistrare — static + live); „24 ore" trebuie raportat la ultima înregistrare, nu la momentul curent.                                                                                                                                                                                                            |
| **`reactStrictMode: true` + fără `ignoreBuildErrors`**                    | Build-ul validează tipurile; Strict Mode descoperă bug-uri de render (fix-ul de hidratare e deja în loc, vezi [05-ui-dashboard.md](./05-ui-dashboard.md)).                                                                                                                                                                                          |
| **Interfața în română + formatare `Intl` ro-RO**                          | Publicul țintă e românesc; formatarea (spațiu mii, virgulă zecimale) e centralizată în `format.ts`.                                                                                                                                                                                                                                                 |
| **Stocarea (ISPOZ): istoric construit de noi, orar**                      | Transelectrica expune stocarea DOAR ca snapshot (`/sen-filter`), fără istoric. Workflow-ul `storage-capture` (cron orar) acumulează capturi în `data/sen-storage.json`; la runtime `storage.ts` întreabă snapshot-ul live (TTL 10 min) cu fallback la ultima captură. Vezi [02-pipeline-date.md](./02-pipeline-date.md) + [03-api.md](./03-api.md). |

## Fișierele principale

| Fișier                                                                                      | Rol                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`src/app/page.tsx`](../src/app/page.tsx)                                                   | Pagina principală: orchestrează filtre, KPI-uri, grafice, tabel                                            |
| [`src/app/layout.tsx`](../src/app/layout.tsx)                                               | Layout + metadata (ro) + providers                                                                         |
| [`src/components/providers.tsx`](../src/components/providers.tsx)                           | ThemeProvider + QueryClientProvider                                                                        |
| [`src/lib/sen/index.ts`](../src/lib/sen/index.ts)                                           | Barrel export **client-safe** (logică pură, fără `node:fs`); `loader.ts` se importă direct, doar pe server |
| [`src/lib/utils.ts`](../src/lib/utils.ts)                                                   | `cn()` — combinare clase Tailwind                                                                          |
| [`src/lib/sen/storage.ts`](../src/lib/sen/storage.ts)                                       | Stocare (ISPOZ) — server-only: încarcă seria acumulată + fetch snapshot live cu TTL 10 min și fallback     |
| [`src/components/dashboard/storage-card.tsx`](../src/components/dashboard/storage-card.tsx) | Mini-card „Stocare": valoare curentă + sparkline + trend (sidebar, lângă Mixul curent)                     |

## Cum navighezi mai departe

- Vrei detaliul datelor → [02-pipeline-date.md](./02-pipeline-date.md)
- Vrei detaliul API → [03-api.md](./03-api.md)
- Vrei detaliul funcțiilor pure → [04-strat-date.md](./04-strat-date.md)
- Vrei detaliul componentelor → [05-ui-dashboard.md](./05-ui-dashboard.md)
- Vrei să cauți un anumit fișier pe baza unei întrebări → [08-harta-cautare.md](./08-harta-cautare.md)
