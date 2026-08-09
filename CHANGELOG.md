# Changelog

Toate modificările notabile ale proiectului sunt documentate în acest fișier.

Formatul respectă [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), iar versiunile respectă [Semantic Versioning](https://semver.org/lang/ro/).

Timestamp-urile sunt în **ora României** (EEST, UTC+3 — vara; EET, UTC+2 — iarna).

## [0.3.3] — 2026-08-09, 10:45 EEST

### Reparat

- **Fereastra gardei anti-shift lărgită la 00-06h** (era 00-04h) în `hasSuspiciousNightSolar` (`live.ts`) și în sanity-check-ul din `convert-sen.py --fetch`. Vara, solarul e ~0 până la ~05:30-06:15 ora României, deci un shift de coloane care ar pune `eolian` (~680 MW) în `foto` la 04:00-05:00 scăpa de gardă. Fereastra nouă acoperă noaptea fizică de vară, fără fals-pozitive (verificat pe datele reale: primul `foto > 50` e la 06:13, max înainte de 06:00 = 13 MW).
- **Workflow-ul `data-refresh` eșua silențios la eșecuri persistente**: adăugat pasul „Verify data freshness" — dacă `data/sen-summary.json` e mai vechi de ~40h (o zi pierdută dă ~21h la ora cronului și max ~36.5h chiar la un `workflow_dispatch` seara — deci un eșec tranzitoriu nu produce alarmă falsă niciodată; două+ zile consecutive dau minim ~45h), workflow-ul eșuează vizibil în Actions în loc să comite tăcut.
- **Comentariu preventiv în `convert-sen.py`**: `tz=timezone.utc` la construirea `start`-ului e intenționat (contract fake-UTC — ts-urile sunt wall-clock România etichetat UTC) și NU trebuie schimbat pe `TZ_RO` (ar muta fereastra cu +2-3h și ar pierde date la fiecare refresh).

### Adăugat

- Două teste noi în `live.test.ts`: `hasSuspiciousNightSolar` prinde `foto > 50` la 04:30 și la 05:30 (fereastra 00-06h). Total: **90 de teste unitare**.
- Comentarii explicite în `types.ts`: `SenSummaryResponse.count` poate include citiri live (stats/balance rămân pe istoricul static, intenționat); semnul `avgImport` (pozitiv = media soldurilor > 0) și `avgExport` (negativ = media soldurilor < 0).

## [0.3.2] — 2026-08-09, 10:30 EEST

### Reparat

- **🔴 Ordinea coloanelor de la endpoint-ul live Transelectrica**: widget-ul „SEN Grafic" pune `Sold` pe poziția a 4-a (imediat după `Productie`), NU pe ultima ca în xlsx. `LIVE_FIELDS` (`convert-sen.py`) și `FIELD_ORDER` (`live.ts`) mapau greșit → toate datele live (atât cele de la `--fetch`, cât și la runtime) erau shiftate cu o poziție (carbune ⇄ sold etc.). Fix + sanity-check nou în `--fetch` („solarul nu produce noaptea" — oprește actualizarea la un posibil shift). Datele de pe disc au fost **regenerate complet** (`data:convert` + `data:refresh`) — fereastra de overlap coruptă și rândurile de noapte cu valori imposibile (foto 2247-2516 MW) sunt reparate (night foto max = −1).
- **Semantica sold**: confirmată pe sursa oficială (`SOLD = CONS − PROD`, verificat pe `sen-filter`: CONS 4595 − PROD 5657 = −1062 = SOLD). Sold **pozitiv = import** (consum peste producție), **negativ = export** — UI-ul eticheta invers (pozitiv = „Export"). Actualizate: `formatSold`, `balanceStats` (split pe `> 0` import), `SERIES_COLORS` (pozitiv roșu / negativ verde), `KpiCards`, `BalanceChart`, `DataTable`.
- **Dublu-fetch la Transelectrica pe cache rece**: `getLiveReadings()` rulează acum cu o promisiune în zbor partajată (`inflightFetch`) — `Promise.all([getLiveReadings(), getLiveSummary()])` face un singur fetch, nu două.
- **Workflow-ul `data-refresh`**: `continue-on-error` pe step-ul de fetch (un eșec tranzitoriu de rețea nu mai pierde ziua — commit-ul se face doar dacă datele s-au schimbat) + `fetch_live` nu mai aruncă la `urllib.error` (întoarce date goale).
- **Zero-pad query params** în `convert-sen.py` (`day=08`, `hour=06` etc.) — consistent cu `buildLiveUrl` din `live.ts`.

### Adăugat

- Test nou în `live.test.ts`: `parseLiveLine` validează ordinea live (`sold` pe 4) și o compară cu valorile xlsx la același ts (18:07:57); testele de merge folosesc timestampuri relative la `endTs` static (robuste la date noi pe disc). Total: **88 de teste unitare**.

## [0.3.1] — 2026-08-09, 08:00 EEST

### Reparat

- `docs/01-arhitectura.md`: cifra înregistrărilor actualizată (5.546 → 5.599) + menționat `live.ts` în layere și fluxul de date live.

### Adăugat

- **Acoperire de teste mărită la ~100% pe `src/lib/sen/`**: `formatRelative` (toate branșele: secunde/minute/ore/zile, singular/plural), `getLiveReadings`/`getLiveSummary` cu fetch mock-uit (merge live + fallback la eșec + summary fără date noi), `loader` (`loadReadings`/`loadSummary` pe datele reale din repo, sortare verificată). Export nou `resetLiveCache()` pentru teste. Acum **84 de teste unitare**. Coverage raportat de `bun test --coverage`: aggregate/constants/format/live/stats/types = 100%, loader = 96% lines.

## [0.3.0] — 2026-08-09, 07:00 EEST

### Adăugat

- **Date live Transelectrica** (`src/lib/sen/live.ts`, server-only): `/api/sen`, `/api/sen/summary` și `/api/sen/export` includ acum datele live de pe endpoint-ul public al widget-ului „SEN Grafic" (`transelectrica.ro/widget/web/tel/sen-grafic`, `p_p_lifecycle=2`) — cache TTL 10 min, **fallback silențios la datele statice** dacă Transelectrica e indisponibilă (dashboard-ul nu se rupe).
- **`bun run data:refresh`** — mod `--fetch` în `scripts/convert-sen.py`: descarcă **incremental** (de la ultimul `ts` + 2h overlap) și adaugă datele noi la `data/sen-data.json` + regenerează summary-ul. Modul xlsx rămâne (import lazy `openpyxl`, refresh e stdlib-only).
- **Workflow GitHub Actions** `.github/workflows/data-refresh.yml`: cron zilnic (03:30 UTC = 06:30 EEST vara) rulează `data:refresh` și face commit — istoricul crește singur, Vercel redeploy-ează automat (Git integration).
- **13 teste noi** (`tests/sen/live.test.ts`): parsing live, dedupe/merge, offset EET/EEST cu granițe DST, construcția URL-ului — acum **76 de teste unitare, 186 expect()**.
- Setul de date actualizat: **5.599 înregistrări** (01.07.2026 → 09.08.2026, 06:38), `renewableShareAvg` 48,8%.

## [0.2.3] — 2026-08-09, 05:56 EEST

### Reparat

- `formatLastUpdatedLabel` nu mai lasă spațiu final la input gol: întoarce label-ul de bază „Ultima înregistrare, actualizată" (fără whitespace), păstrând interpolarea pentru valori non-goale; test actualizat în `format.test.ts`.

### Schimbat

- Checklist-ul „Cum testezi" din `docs/04-strat-date.md` include acum `bun run docs:mark-verified` după modificările de cod/documentație și `bun run check` ca verificare finală (aliniat cu AGENTS §7 și docs/07).

## [0.2.2] — 2026-08-08, 22:52 EEST

### Schimbat

- **Nuclearul NU mai e numărat în share-ul regenerabil** — `RENEWABLE_FIELDS` e acum strict RES (`ape`, `eolian`, `foto`, `biomasa`), iar `SOURCES.nuclear.kind` devine `lowcarbon`. Nuclearul rămâne afișat în grafice ca sursă, dar nu mai umflă KPI-ul „Share regenerabil" (valoarea medie: 68,3% → 48,4%). Aplicat în `constants.ts`, `convert-sen.py` și regenerat `data/sen-summary.json`.
- **Barrel-ul `@/lib/sen` e acum client-safe** — `loader.ts` nu mai e re-exportat prin `index.ts`; se importă direct, doar din API routes (fără risc ca `node:fs` să ajungă în bundle-ul client).
- Docs clarifică **contractul de timp**: valorile sursă sunt wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO.

### Reparat

- **Bug de fus orar (important)**: `format.ts` și `bucketKey` foloseau getters/constructori **locale** (`getHours`, `new Date(y,m,d,…)`), dar datele sunt etichetate UTC. Pe un sistem EEST (ora României), UI-ul afișa `21:07` în loc de `18:07` din sursă, iar bucket-urile de zi începeau la `21:00Z`. Acum totul folosește **UTC** (`getUTCHours`, `Date.UTC`, `timeZone: "UTC"`) în `format.ts`, `aggregate.ts`; formatter-ul de axă X duplicat în 3 grafice e consolidat în `formatAxisTick` (sursă unică), iar tooltip-ul reutilizează `formatDateTime`. Testele trec identic cu `TZ=UTC` și `TZ=Europe/Bucharest`.
- `aria-label`-ul badge-ului din `Header` folosește acordul feminin corect: „Ultima înregistrare, actualizată …" (helper nou `formatLastUpdatedLabel`, testat unitar); badge-ul are acum `role="status"` pentru expunere fiabilă la screen readers.
- `SOURCES.nuclear.hint` e acum complet în română: „cu emisii reduse de carbon, neregenerabilă" (era „low-carbon, nu regenerabil").
- Contractul de timp (wall-clock România, fără conversie EET/EEST, etichetat UTC + getters UTC) are acum aceeași formulare în `AGENTS.md` §4.7, `docs/02`, `docs/04` și `CHANGELOG`.
- Typo „regenrate" → „regenerat" în nota despre `sen-summary.json`.

### Adăugat

- Teste de regresie: nuclearul singur nu contribuie la `renewableShare`, acordul feminin al etichetei „ultima înregistrare" (`formatLastUpdatedLabel`), TZ-independența lui `formatDateTime`/`bucketKey`/`formatAxisTick` — 63 de teste unitare, 143 expect().
- `AGENTS.md` §7: „Workflow pentru verificarea cererilor de fix" — pașii verificați (verifică contra codului → întreabă la decizii de produs → schimbări minime → regenerează datele → teste de regresie → docs la zi → `bun run check` → curățare), ca orice agent viitor să poată reproduce procesul.
- `aria-label` românesc pe badge-ul de „actualizat" din `Header`.

### Reparat

- `aria-label`-ul badge-ului din `Header` folosește acordul feminin corect: „Ultima înregistrare, actualizată …" (helper nou `formatLastUpdatedLabel`, testat unitar); badge-ul are acum `role="status"` pentru expunere fiabilă la screen readers.
- `SOURCES.nuclear.hint` e acum complet în română: „cu emisii reduse de carbon, neregenerabilă" (era „low-carbon, nu regenerabil").
- Contractul de timp (wall-clock România, fără conversie EET/EEST, etichetat UTC) are acum aceeași formulare în `AGENTS.md` §4.7, `docs/04-strat-date.md` și `CHANGELOG`.
- Typo „regenrate" → „regenerat" în nota despre `sen-summary.json`.
- Tabel de scripturi rupt în `README.md` (rândul `format`/`check:hydration` cu 6 coloane) — împărțit corect; rândul `bun run check` menționează acum și pasul `docs:check`.
- Rând de tabel rupt în `docs/06-design.md` (`--border` + `--chart-1..5` pe aceeași linie) — împărțit corect.
- Ghilimea închisă greșită (`"`) după „corecta în `docs/08-harta-cautare.md` și `AGENTS.md` — corectată la `”`.
- `scripts/check-docs-stale.sh` și `scripts/mark-docs-verified.sh`: `set -uo` → `set -euo pipefail` (eroarea de python nu mai e tratată ca „totul ok").
- `scripts/mark-docs-verified.sh`: scriere atomică a manifestului (fișier temporar + `os.replace`, curățare la eșec).

## [0.2.1] — 2026-08-08, 22:10 EEST

### Eliminat

- SDK-ul `z-ai-web-dev-sdk` și toate referințele z.ai din proiect (dependency, lockfile, `.gitignore`).
- Scaffold-ul de deployment al platformei: `.zscripts/`, `Caddyfile`, `mini-services/`, `examples/websocket/`.
- Boilerplate-ul Prisma nefolosit: schema `User`/`Post`, `src/lib/db.ts`, `db/custom.db`, `.env`, scripturile `db:*` din `package.json`.
- Scripturile de test ale runtime-ului platformei (`tests/python-runtime-*.sh`, `tests/database-runtime-build.sh`).

### Adăugat

- Scriptul `bun run check`: rulează întregul pipeline CI într-o singură comandă, în ordinea best-practice — `format:check` → `docs:check` → `lint` → `typecheck` → `test` → `build`.
- Activat `reactStrictMode` și eliminată opțiunea `ignoreBuildErrors` din `next.config.ts` (build-ul validează acum tipurile).
- Verificarea „documentație stale": `docs:check` (parte din `bun run check`) compară fiecare document din `docs/` cu fișierele sursă pe care le acoperă (manifest `docs/.docs-manifest.json`) și semnalează documentele care trebuie actualizate; `docs:mark-verified` marchează documentația ca fiind la zi.
- Indexul documentației `docs/00-index.md` (înlocuiește fostul `docs/README.md`) ca punct de intrare unic, recomandat din `README.md` și `AGENTS.md`; adăugate timestamp-uri în ora României (EEST) în CHANGELOG.

### Reparat

- Erori de tip TypeScript pre-existente care blocau `bun run typecheck`: construcția obiectelor `AggregatedPoint` în `aggregate.ts`, tipul index-signature din `data-table.tsx`, și rezolvarea modulului `bun:test` prin includerea `bun-types` în `tsconfig.json`.

## [0.2.0] — 2026-08-08, 20:01 EEST

### Adăugat

- **Pipeline de date**: conversie `upload/Grafic_SEN.xlsx` → `data/sen-data.json` + `data/sen-summary.json` prin `scripts/convert-sen.py` — 5.546 înregistrări la intervale de 10 minute (01.07.2026 → 08.08.2026), date Transelectrica.
- **Modul de date tipizat** `src/lib/sen/`: tipuri, constante (culori semantice pe surse, etichete RO), agregare pe bucket-uri de timp, statistici, formatare `Intl` ro-RO, loader server-only cu cache singleton.
- **55 de teste unitare** pentru agregare, statistici și formatare (`tests/sen/`), rulabile cu `bun test`.
- **API routes**: `/api/sen` (agregare interval + granularitate, cu downsampling pentru protecția clientului), `/api/sen/summary` (KPI global precalculat), `/api/sen/export` (export CSV).
- **Dashboard complet în română**: 4 KPI-uri, grafic producție pe surse (stacked area + linie consum), consum vs. producție, balanța energetică (import/export cu gradient divergent), distribuție pe surse (donut), tabel de date brute, filtre cu preset-uri 24h/3d/7d/30d/tot + granularitate + export CSV.
- **Temă dark-first „control room"** cu accent emerald, fundal cu aură radială subtilă, scrollbar personalizat; toggle light/dark.
- **Tooling de calitate**: ESLint + Prettier, TypeScript strict, script de verificare a hidratării (`bun run check:hydration`).

### Reparat

- Mismatch de hidratare la `ThemeToggle`: înlocuit pattern-ul bazat pe `useEffect` cu un hook `useMounted()` pe `useSyncExternalStore`, eliminând orice diferență server/client.
- Fundalul „grid pattern" care apărea distorsionat (moiré) — înlocuit cu un gradient radial curat.
