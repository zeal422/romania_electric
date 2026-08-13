# SEN Dashboard — Sistemul Energetic Național (România)

Dashboard interactiv pentru consumul și producția de energie din **Sistemul Energetic Național** al României, construit pe baza datelor publicate de **Transelectrica**.

Arhiva locală acoperă intervalul **1 iulie → 9 august 2026**, cu **5.606 de înregistrări** la intervale de ~10 minute (consum, producție pe surse, sold import/export); se extinde **automat zilnic** prin fetch incremental de pe site-ul live Transelectrica (deci intervalul rămâne la zi pe măsură ce datele noi sunt publicate). Dashboard-ul afișează **valori real-time** (Consum/Producție/Sold + mix, poll-uite la ~30s de pe `/sen-filter` — același endpoint pe care site-ul oficial îl actualizează la 10s) peste seria istorică (cache 10 min, cu fallback la datele stale din cache — max 24h — sau la cele statice dacă Transelectrica e indisponibilă).

![Tech stack](https://img.shields.io/badge/Next.js%2016-React%2019-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Tests](https://img.shields.io/badge/tests-174%20de%20teste%20unit%C4%83re-green) ![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)

---

## Funcționalități

- **4 KPI-uri real-time**: consum curent, producție, pondere regenerabil, stare balanță (import/export) — actualizate la ~30s și la revenirea pe tab.
- **Producția pe surse**: arie stivuită cu consum suprapus — cărbune, hidrocarburi, nuclear, ape, eolian, solar, biomasă.
- **Consum vs. producție**: cerere și ofertă în intervalul selectat.
- **Balanța energetică (Sold)**: pozitiv = import, negativ = export (semantica oficială `SOLD = CONS − PROD`), cu gradient divergent.
- **Mixul curent**: defalcare pe surse la ultima înregistrare (donut).
- **Stocare (ISPOZ)**: mini-card cu valoarea curentă a „Instalațiilor de stocare" (MW), trend (încărcare/descărcare) și sparkline cu seria acumulată prin capturi orare automate (istoric construit de noi — Transelectrica expune stocarea doar ca snapshot).
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
| `bun test`                        | Rulează cele 174 de teste unitare                                                                                                                     |
| `bun run typecheck`               | Verificare tipuri TypeScript (`tsc --noEmit`)                                                                                                         |
| `bun run lint`                    | ESLint                                                                                                                                                |
| `bun run format` / `format:check` | Prettier (scriere / verificare)                                                                                                                       |
| `bun run check:hydration`         | Verifică lipsa erorilor de hidratare în browser                                                                                                       |
| `bun run docs:check`              | Verifică că documentația e la zi cu codul (hash-uri vs. fișiere sursă)                                                                                |
| `bun run docs:mark-verified`      | Marchează documentația ca verificată (după actualizare)                                                                                               |
| `bun run data:convert`            | Regenerează `data/*.json` din `upload/Grafic_SEN.xlsx` (rebuild complet)                                                                              |
| `bun run data:refresh`            | Fetch incremental live de la Transelectrica → adaugă datele noi la `data/*.json`                                                                      |
| `bun run check`                   | **Pipeline CI core într-o singură comandă**: format → docs → lint → typecheck → teste → build (fără `check:hydration`, care necesită `agent-browser`) |

## Pipeline de date

```
upload/Grafic_SEN.xlsx  (sursă istorică Transelectrica)
        │  bun run data:convert  (rebuild complet)
        ▼
data/sen-data.json      (5.606 înregistrări tipizate, sortate crescător)
data/sen-summary.json   (statistici globale precalculate pentru KPI)
        ▲
        │  bun run data:refresh  (fetch incremental live, automat zilnic în CI)
endpoint live Transelectrica (transelectrica.ro/widget/web/tel/sen-grafic)
        │  src/lib/sen/loader.ts + live.ts  (server-only)
        ▼
API routes  →  React Query  →  Dashboard

Stocare (ISPOZ):
snapshot /sen-filter → data/sen-storage.json (capturi orare, workflow storage-capture)
        │  src/lib/sen/storage.ts (server-only, TTL 3 min + fallback)
        ▼
/api/sen/storage  →  StorageCard (valoare + sparkline + trend)
```

- **Convertor**: `scripts/convert-sen.py` (Python) — modul implicit citește foaia „Grafic SEN" din xlsx (openpyxl); modul `--fetch` descarcă **incremental** de pe endpoint-ul public Transelectrica (stdlib-only, fără openpyxl). Ambele normalizează timpul și valorile (elimină markerii `*`), sortează crescător și calculează summary-ul global.
- **Date live la runtime**: `src/lib/sen/live.ts` face fetch la Transelectrica cu **cache TTL 10 min** și **fallback la datele stale din cache (max 24h) sau la cele statice** dacă fetch-ul eșuează — dashboard-ul rămâne funcțional oricând, dar afișează și cele mai recente date.
- **Valori real-time**: `src/lib/sen/instant.ts` poll-uiește `/sen-filter` (TTL 10s server + polling client 30s + `refetchOnWindowFocus`) pentru Consum/Producție/Sold + mixul curent; la eșec UI-ul cade lin pe seria istorică. Graficele rămân la cadența reală a sursei (~10 min).
- **Automatizare**: workflow-ul `.github/workflows/data-refresh.yml` rulează zilnic `bun run data:refresh` și face commit — istoricul crește singur, iar Vercel redeploy-ează automat (Git integration).
- **Stocare (ISPOZ)**: Transelectrica expune stocarea doar ca snapshot (`/sen-filter`), fără istoric. Workflow-ul `.github/workflows/storage-capture.yml` (cron orar) rulează `python3 scripts/convert-sen.py --capture-storage` și acumulează puncte în `data/sen-storage.json`; la runtime `src/lib/sen/storage.ts` întreabă snapshot-ul live (TTL 3 min), cu fallback în ordine: **răspunsul live → snapshot-ul live stale din cache → ultima captură** (Transelectrica indisponibilă nu rupe site-ul).

> Notă: datele din fișierul sursă sunt etichetate cu anul 2026. Le afișăm fidel, așa cum apar în sursă, fără modificarea anului.

## API

| Endpoint                                                         | Descriere                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sen?from=<ts>&to=<ts>&granularity=raw\|10m\|hour\|day` | Puncte agregate în interval, cu statistici pe interval (consum/producție/sold, pondere regenerabil). La `raw` pe intervale mari se aplică downsampling uniform la 1.200 de puncte. |
| `GET /api/sen/summary`                                           | KPI global precalculat: count, start/end, ultima înregistrare, statistici pe toate câmpurile, balanță import/export.                                                               |
| `GET /api/sen/instant`                                           | Valori real-time (Consum/Producție/Sold + mix pe surse) — `null` la eșec/stale.                                                                                                    |
| `GET /api/sen/storage`                                           | Stocare (ISPOZ): valoarea curentă + seria acumulată de capturi orare.                                                                                                              |
| `GET /api/sen/export?from=<ts>&to=<ts>`                          | Export CSV (separator `;`, zecimal `.`) cu datele brute din interval.                                                                                                              |

Parametrii `from`/`to` sunt timestamp-uri epoch (ms); dacă lipsesc, se folosesc capetele întregului set de date.

## Documentație tehnică

Documentația detaliată a codului este în folderul [`docs/`](./docs/00-index.md) — începe cu indexul `00`, apoi arhitectură, pipeline de date, API, stratul de date, UI, design, testare și o hartă de căutare pentru dezvoltatori și agenți AI. Regulile de lucru pentru agenți AI sunt în [`AGENTS.md`](./AGENTS.md), iar istoricul modificărilor în [`CHANGELOG.md`](./CHANGELOG.md).

## Structura proiectului

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Pagina principală (dashboard)
│   │   └── api/sen/              # /api/sen, /api/sen/summary, /api/sen/instant, /api/sen/storage, /api/sen/export
│   ├── components/
│   │   ├── dashboard/            # KPI, grafice, filtre, tabel, header, footer
│   │   └── ui/                   # shadcn/ui
│   ├── hooks/
│   │   ├── use-sen-data.ts       # React Query hooks
│   │   ├── use-instant-data.ts   # React Query hook pentru valorile real-time (polling 30s)
│   │   ├── use-storage-data.ts   # React Query hook pentru stocare (ISPOZ)
│   │   ├── use-mounted.ts        # useSyncExternalStore (fix hidratare)
│   │   └── use-local-preference.ts # Preferințe persistente (localStorage)
│   └── lib/
│       ├── local-preference.ts   # Logica pură a preferințelor persistente
│       ├── utils.ts              # Helperi (cn, formatare)
│       └── sen/                  # Logică pură, tipizată, testabilă
│           ├── types.ts          # SenReading, Granularity, răspunsuri API
│           ├── constants.ts      # Culori semantice, etichete RO, ordinea surselor
│           ├── aggregate.ts      # Bucketing, medie, filtrare, downsampling
│           ├── stats.ts          # min/max/avg, pondere regenerabil, balanță
│           ├── format.ts         # Formatare Intl ro-RO
│           ├── loader.ts         # Citire fișiere JSON (server-only, cache)
│           ├── live.ts           # Fetch live Transelectrica (server-only, TTL + fallback)
│           ├── instant.ts        # Valori real-time /sen-filter (server-only, TTL + fallback)
│           ├── storage.ts        # Stocare ISPOZ (server-only, snapshot live + serie)
│           └── index.ts          # Barrel export (client-safe)
├── .github/workflows/            # data-refresh.yml (zilnic) + storage-capture.yml (orar)
├── data/                         # sen-data.json, sen-summary.json, sen-storage.json (generat)
├── docs/                         # Documentație tehnică (arhitectură, API, UI, design, testing)
├── scripts/
│   ├── convert-sen.py            # xlsx → JSON (convert) + fetch live incremental (refresh)
│   └── check-hydration.sh        # CI check erori de hidratare
├── tests/                        # 174 de teste unitare (aggregate, stats, format, live, instant, storage, preferințe, captură)
│   ├── sen/                      # tests/sen/*.test.ts (aggregate, stats, format, live, instant)
│   ├── storage.test.ts           # stocare ISPOZ (parser + cache + fallback + source)
│   ├── capture-storage.test.ts   # logica Python de captură (--capture-storage, mock server)
│   └── local-preference.test.ts  # preferințe UI persistente
└── upload/                       # Grafic_SEN.xlsx (sursă)
```

## Calitate și testare

```bash
bun run check       # totul într-o singură comandă (vezi mai jos)
bun run typecheck   # TypeScript strict
bun test            # 174 de teste unitare — toate trec
bun run lint        # ESLint curat
bun run format:check
bun run check:hydration  # fără erori de hidratare în browser (necesită agent-browser)
```

`bun run check` rulează întregul pipeline CI în ordinea recomandată (verificările rapide întâi, build-ul la final):

1. `format:check` — Prettier
2. `docs:check` — documentația e la zi cu codul (hash-uri vs. fișiere sursă)
3. `lint` — ESLint
4. `typecheck` — `tsc --noEmit`
5. `test` — 174 de teste unitare
6. `build` — build de producție (inclusiv validarea tipurilor)

Rulează `bun run check` local înainte de fiecare release (sau într-un pipeline CI, dacă adaugi unul).

## Considerații de arhitectură

- **Loader-ul (`src/lib/sen/loader.ts`) și datele live (`src/lib/sen/live.ts`) rulează DOAR pe server** (`node:fs` / `fetch`) — nu le importa în cod de client.
- **Logica de date e pură și deterministă** (`aggregate`, `stats`, `format`) — ușor de testat unitar.
- **Interfața e în română peste tot**; culorile surselor sunt semantice (cărbune = gri închis, gaz = portocaliu, hidro = cyan, nuclear = lime, eolian = teal, solar = galben, biomasă = verde) și definite central în `constants.ts`.

## Disclaimer

Datele provin din `Grafic_SEN.xlsx` și de pe site-ul public Transelectrica (`transelectrica.ro/widget/web/tel/sen-grafic`, widget „SEN Grafic") și sunt incluse aici pentru demonstrație. Acest proiect nu este afiliat oficial cu Transelectrica.
