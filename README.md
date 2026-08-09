# SEN Dashboard — Sistemul Energetic Național (România)

Dashboard interactiv pentru consumul și producția de energie din **Sistemul Energetic Național** al României, construit pe baza datelor publicate de **Transelectrica**.

Datele acoperă intervalul **1 iulie – 8 august 2026**, cu **5.546 de înregistrări** la intervale de ~10 minute (consum, producție pe surse, sold import/export).

![Tech stack](https://img.shields.io/badge/Next.js%2016-React%2019-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Tests](https://img.shields.io/badge/tests-63%20unit%C4%83%C8%9Bi-green) ![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)

---

## Funcționalități

- **4 KPI-uri live**: consum curent, producție, pondere regenerabil, stare balanță (import/export).
- **Producția pe surse**: arie stivuită cu consum suprapus — cărbune, hidrocarburi, nuclear, ape, eolian, solar, biomasă.
- **Consum vs. producție**: cerere și ofertă în intervalul selectat.
- **Balanța energetică (Sold)**: pozitiv = export, negativ = import, cu gradient divergent.
- **Mixul curent**: defalcare pe surse la ultima înregistrare (donut).
- **Filtre flexibile**: preset-uri 24h / 3 zile / 7 zile / 30 zile / tot intervalul, granularitate (brut 10 min / orar / zilnic), export CSV.
- **Tabel de date brute** cu badge-uri colorate pentru starea soldului.
- **Temă dark-first „control room"** cu accent emerald + toggle light/dark.
- **Întreaga interfață în limba română**, formatare `Intl` ro-RO.

## Tehnologii

| Strat       | Tehnologie                                   |
| ----------- | -------------------------------------------- |
| Framework   | Next.js 16 (App Router), React 19, Turbopack |
| Date client | TanStack React Query                         |
| Grafice     | Recharts                                     |
| Stil        | Tailwind CSS 4 + shadcn/ui                   |
| Tipuri      | TypeScript strict                            |
| Runtime     | Bun                                          |
| Teste       | Bun test (`bun:test`)                        |
| Calitate    | ESLint + Prettier + check de hidratare       |

## Început rapid

Cerințe: [Bun](https://bun.sh) ≥ 1.1 (recomandat 1.3+), Node.js ≥ 20.

```bash
# 1. Instalează dependențele
bun install

# 2. Pornește serverul de dezvoltare
bun run dev
# → http://localhost:3000
```

Build de producție:

```bash
bun run build      # build standalone (Next.js)
bun run start      # pornește serverul de producție din .next/standalone
```

## Scripturi

| Script                            | Descriere                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`                     | Server de dezvoltare pe portul 3000                                                                                                                   |
| `bun run build`                   | Build de producție (standalone + static)                                                                                                              |
| `bun run start`                   | Pornește build-ul standalone                                                                                                                          |
| `bun test`                        | Rulează cele 63 de teste unitare                                                                                                                      |
| `bun run typecheck`               | Verificare tipuri TypeScript (`tsc --noEmit`)                                                                                                         |
| `bun run lint`                    | ESLint                                                                                                                                                |
| `bun run format` / `format:check` | Prettier (scriere / verificare)                                                                                                                       |
| `bun run check:hydration`         | Verifică lipsa erorilor de hidratare în browser                                                                                                       |
| `bun run docs:check`              | Verifică că documentația e la zi cu codul (hash-uri vs. fișiere sursă)                                                                                |
| `bun run docs:mark-verified`      | Marchează documentația ca verificată (după actualizare)                                                                                               |
| `bun run data:convert`            | Regenerează `data/*.json` din `upload/Grafic_SEN.xlsx`                                                                                                |
| `bun run check`                   | **Pipeline CI core într-o singură comandă**: format → docs → lint → typecheck → teste → build (fără `check:hydration`, care necesită `agent-browser`) |

## Pipeline de date

```
upload/Grafic_SEN.xlsx  (sursă Transelectrica)
        │  bun run data:convert  (scripts/convert-sen.py)
        ▼
data/sen-data.json      (5.546 înregistrări tipizate, sortate crescător)
data/sen-summary.json   (statistici globale precalculate pentru KPI)
        │  src/lib/sen/loader.ts  (cache singleton, server-only)
        ▼
API routes  →  React Query  →  Dashboard
```

- **Convertor**: `scripts/convert-sen.py` (Python + openpyxl) — citește foaia „Grafic SEN", normalizează timpul și valorile (elimină markerii `*`), sortează crescător și calculează summary-ul global.
- **Regenerare**: după înlocuirea fișierului `upload/Grafic_SEN.xlsx`, rulează `bun run data:convert` și repornește serverul (loader-ul folosește cache singleton).

> Notă: datele din fișierul sursă sunt etichetate cu anul 2026. Le afișăm fidel, așa cum apar în sursă, fără modificarea anului.

## API

| Endpoint                                                         | Descriere                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sen?from=<ts>&to=<ts>&granularity=raw\|10m\|hour\|day` | Puncte agregate în interval, cu statistici pe interval (consum/producție/sold, pondere regenerabil). La `raw` pe intervale mari se aplică downsampling uniform la 1.200 de puncte. |
| `GET /api/sen/summary`                                           | KPI global precalculat: count, start/end, ultima înregistrare, statistici pe toate câmpurile, balanță import/export.                                                               |
| `GET /api/sen/export?from=<ts>&to=<ts>`                          | Export CSV (separator `;`, zecimal `.`) cu datele brute din interval.                                                                                                              |

Parametrii `from`/`to` sunt timestamp-uri epoch (ms); dacă lipsesc, se folosesc capetele întregului set de date.

## Documentație tehnică

Documentația detaliată a codului este în folderul [`docs/`](./docs/00-index.md) — începe cu indexul `00`, apoi arhitectură, pipeline de date, API, stratul de date, UI, design, testare și o hartă de căutare pentru dezvoltatori și agenți AI. Regulile de lucru pentru agenți AI sunt în [`AGENTS.md`](./AGENTS.md), iar istoricul modificărilor în [`CHANGELOG.md`](./CHANGELOG.md).

## Structura proiectului

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Pagina principală (dashboard)
│   │   └── api/sen/              # /api/sen, /api/sen/summary, /api/sen/export
│   ├── components/
│   │   ├── dashboard/            # KPI, grafice, filtre, tabel, header, footer
│   │   └── ui/                   # shadcn/ui
│   ├── hooks/
│   │   ├── use-sen-data.ts       # React Query hooks
│   │   └── use-mounted.ts        # useSyncExternalStore (fix hidratare)
│   └── lib/sen/                  # Logică pură, tipizată, testabilă
│       ├── types.ts              # SenReading, Granularity, răspunsuri API
│       ├── constants.ts          # Culori semantice, etichete RO, ordinea surselor
│       ├── aggregate.ts          # Bucketing, medie, filtrare, downsampling
│       ├── stats.ts              # min/max/avg, pondere regenerabil, balanță
│       ├── format.ts             # Formatare Intl ro-RO
│       ├── loader.ts             # Citire fișiere JSON (server-only, cache)
│       └── index.ts              # Barrel export
├── data/                         # sen-data.json, sen-summary.json (generat)
├── docs/                         # Documentație tehnică (arhitectură, API, UI, design, testing)
├── scripts/
│   ├── convert-sen.py            # xlsx → JSON
│   └── check-hydration.sh        # CI check erori de hidratare
├── tests/sen/                    # 63 teste unitare (aggregate, stats, format)
└── upload/                       # Grafic_SEN.xlsx (sursă)
```

## Calitate și testare

```bash
bun run check       # totul într-o singură comandă (vezi mai jos)
bun run typecheck   # TypeScript strict
bun test            # 63 teste unitare — toate trec
bun run lint        # ESLint curat
bun run format:check
bun run check:hydration  # fără erori de hidratare în browser (necesită agent-browser)
```

`bun run check` rulează întregul pipeline CI în ordinea recomandată (verificările rapide întâi, build-ul la final):

1. `format:check` — Prettier
2. `docs:check` — documentația e la zi cu codul (hash-uri vs. fișiere sursă)
3. `lint` — ESLint
4. `typecheck` — `tsc --noEmit`
5. `test` — 63 de teste unitare
6. `build` — build de producție (inclusiv validarea tipurilor)

Rulează `bun run check` local înainte de fiecare release (sau într-un pipeline CI, dacă adaugi unul).

## Considerații de arhitectură

- **Loader-ul (`src/lib/sen/loader.ts`) folosește `node:fs` și rulează DOAR pe server** — nu importa în cod de client.
- **Logica de date e pură și deterministă** (`aggregate`, `stats`, `format`) — ușor de testat unitar.
- **Interfața e în română peste tot**; culorile surselor sunt semantice (cărbune = gri închis, gaz = portocaliu, hidro = cyan, nuclear = lime, eolian = teal, solar = galben, biomasă = verde) și definite central în `constants.ts`.

## Disclaimer

Datele provin din fișierul `Grafic_SEN.xlsx` publicat de Transelectrica și sunt incluse aici pentru demonstrație. Acest proiect nu este afiliat oficial cu Transelectrica.
