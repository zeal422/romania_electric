# Changelog

Toate modificările notabile ale proiectului sunt documentate în acest fișier.

Formatul respectă [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), iar versiunile respectă [Semantic Versioning](https://semver.org/lang/ro/).

Timestamp-urile sunt în **ora României** (EEST, UTC+3 — vara; EET, UTC+2 — iarna).

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
