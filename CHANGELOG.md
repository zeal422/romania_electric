# Changelog

Toate modificările notabile ale proiectului sunt documentate în acest fișier.

Formatul respectă [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), iar versiunile respectă [Semantic Versioning](https://semver.org/lang/ro/).

Timestamp-urile sunt în **ora României** (EEST, UTC+3 — vara; EET, UTC+2 — iarna).

## [0.3.34] — 2026-08-23, 20:02 EEST

### Adăugat

- **Gardă de deploy: `outputFileTracingIncludes` pentru `data/*.json`** (`next.config.ts`): cheia nouă `"/api/**": ["./data/**"]` include explicit fișierele de date în bundle-ul fiecărei rute API. Rutele server-only (`loader.ts`, `prices.ts`, `storage.ts`) citesc `data/*.json` cu `fs.readFile(path.join(process.cwd(), …))` la runtime; azi node-file-trace le include deja implicit prin analiza statică a apelurilor (verificat empiric pe artefacte: fiecare `.nft.json` per-rută conține exact fișierele citite de ruta respectivă), dar asta e detaliu de implementare Next, nu contract — un refactor spre căi dinamice sau un schimb major de tracing l-ar rupe silențios. Config-ul transformă dependența implicită în contract declarat; glob-ul `/api/**` acoperă automat și rute viitoare (inclusiv `instant`, care azi nu citește date), iar paginile sunt scutite intenționat (client-only, datele vin prin React Query).
- **Documentație**: decizia documentată în `docs/01` („Decizii cheie de arhitectură") — `output: "standalone"` + `outputFileTracingIncludes`, cu raționamentul complet.
- **README**: secțiune nouă „Publicare (git → GitHub → Vercel)" — fluxul canonic (`updates` → merge `main` → `pull --rebase` → `push`), rolul commit-urilor automate de date și ce faci la un push respins cu `(fetch first)`.

### Verificare (§4.14)

- **Efect pe artefacte, confirmat după build**: `.next/standalone/data/` conține toate cele 4 JSON-uri (ca înainte), iar trace-urile per-rută se lărgesc exact cât promite config-ul — **fiecare rută din `/api/**` primește acum toate cele 4 fișiere**, inclusiv rutele care nu le citesc integral (`instant` — niciunul înainte; `storage` — doar `sen-storage` înainte). Supra-includerea e intenționată (contract uniform pe tot `/api/**`; ~1,8 MB nefolosit per funcție, comprimat la deploy), iar comportamentul runtime e neschimbat — fiecare rută citește doar ce citea și înainte. Fără test nou în `bun test`: suita nu acoperă config de build (precedente: 0.3.11, 0.3.33); verificarea acestei clase de schimbare = artefacte de build + curl-uri post-deploy.

### Notă

- Starea anterioară era dovedit funcțională pentru deploy — schimbarea e **declarativă** (hardening ieftin contra unui mod de eșec silențios), nu o corecție de bug.
- **package.json**: `0.3.33 → 0.3.34`.

## [0.3.33] — 2026-08-21, 21:05 EEST

### Adăugat

- **Gardă ESLint pentru contractul de timp fake-UTC** (`eslint.config.mjs`): regulă nouă `no-restricted-syntax` pe tot `src/lib/sen/**` — cu excepția intenționată `calendar.ts` (input calendar în fusul LOCAL al browserului, fix 0.3.27) — care interzice mecanic:
  - getterii locali de dată (`getFullYear`…`getMilliseconds`, inclusiv `getTimezoneOffset`) — doar variantele UTC rămân permise;
  - apelurile `toLocale*` fără opțiuni — pattern-ul obligatoriu e `toLocaleString(RO, { timeZone: "UTC" })`, cum apare deja în 5 locuri în `format.ts`;
  - constructorul local `new Date(y,m,d,…)` — doar `Date.UTC(...)`.

  Motivație: contractul era protejat doar prin disciplină, iar bug-urile reale din 0.2.2 (getters locale) și 0.3.27 (off-by-one calendar) arată exact clasa de risc — un agent viitor poate reintroduce getters locali crezând că „repară". Verificare §4.14 bidirecțională: lint verde pe tot codul actual (zero fals-pozitive, inclusiv pe cele 14 module sen); un fișier sintetic cu toate cele 3 clase de încălcare produce exact 5 erori; test de control fără excepția `calendar.ts` prinde exact cei 3 getteri intenționați de la liniile 21–23 (dovedește că regula e activă prin stack-ul real de config). Limite cunoscute, acceptate explicit: apelurile prin destructuring scapă selectorului, `new Date(...spread)` numără 1 argument AST, iar `toLocale(RO,{})` cu opțiuni fără cheia `timeZone` nu e prins (selector mai profund = fragil; riscul rezidual e mic pentru că pattern-ul complet există inline peste tot). Fără test nou în `bun test`: suita nu testează config-ul ESLint, iar protocolul bidirecțional de mai sus ESTE verificarea pentru această clasă de schimbare (precedent: mutarea `STORAGE_TREND_THRESHOLD_MW`, 0.3.11).

### Notă operațională (fără schimbări de repo)

- **Captura orară ISPOZ rulează acum local**, printr-un timer systemd user (`~/.config/systemd/user/sen-storage-capture.{service,timer}` — `OnCalendar=hourly`, `Persistent=true`; echivalentul local al workflow-ului `storage-capture.yml`, care nu poate rula fără remote GitHub). Scriptul apelat e cel existent (`convert-sen.py --capture-storage`, idempotent, tolerant la rețea). Prima captură locală: seria `data/sen-storage.json` a crescut **2 → 3 puncte** (488 MW la 20:57 EEST), reluând seria oprită pe 09.08. Limitări conștiente: capturi doar când PC-ul e pornit și sesiunea e logată (linger off, lăsat nemodificat; `Persistent=true` recuperează o captură ratată la pornirea sesiunii); timer-ul devine redundant când repo-ul urcă pe GitHub și se dezactivează atunci.

### Corectat (documentație/versiune)

- **package.json**: `0.3.27 → 0.3.33` — sincronizat drift-ul pre-existent (bump-urile fuseseră omise începând cu 0.3.28; CHANGELOG era deja la 0.3.32).
- **docs/07**: pasul `lint` descrie acum garda fake-UTC; **docs/08**: rând nou în harta „Teste & tooling" („Unde e garda anti-getter-local?" → `eslint.config.mjs`). Ambele documente acoperă `package.json` în manifest → actualizate cu conținut real + re-verificate.
- **docs/01**: marcat verificat fără modificare de conținut — singura sursă acoperită schimbată e `package.json`, ne-citată în proza documentului (cazul „cosmetic", sancționat explicit de ieșirea `docs:check`); acuratețea conținutului confirmată prin citire înainte de marcare.
- **Eliminate cifrele fixe care drifteau zilnic** din `README.md` (proză + diagrama pipeline), `AGENTS.md` (§1), `docs/01` și `docs/02`: count-ul de înregistrări și data ultimei înregistrări deveneau depășite la fiecare refresh incremental (găsire pre-existentă P3, raportată identic de code-review și myrabbit). Proza descrie acum mecanismul și trimite la sursa de adevăr — `GET /api/sen/summary` (`count`, `startTs`, `endTs`) — păstrând doar părțile stabile (start 01.07.2026, cadența ~10 min). Mențiunile istorice din CHANGELOG rămân înghețate corect (descriu starea de la data intrării).

## [0.3.32] — 2026-08-18, 11:20 EEST

### Corectat

- **Teardown robust al mock server-elor la evenimentele `error` ale child-process-ului** (`tests/dev-refresh.test.ts`, `stopMockServer`): `waitForExit` se rezolvă acum la PRIMUL dintre `exit`/`close`/`error` (o singură cale, nu un wait per eveniment) + **error-listener permanent** atașat la nașterea procesului (`startMockServer`) și pe toată durata ambelor încercări de oprire (SIGTERM + SIGKILL). Fără el, un kill eșuat cu **EPERM** (ramura `else` din `ChildProcess.kill`, Node 22 — real în containere/CI) sau un spawn eșuat (ENOENT) emit `error` fără ascultător → „Unhandled 'error' event” → **crash-ul întregului test runner**, nu doar fail de test. `error` = kill/spawn eșuat → procesul e tratat ca încă viu → escaladare SIGKILL → fail-test dacă tot nu moare (nu continuăm niciodată cu proces viu pe port). Handling-ul existent pentru procese lipsă/deja moarte e păstrat (fix claim 8).

### Teste

- **`tests/dev-refresh.test.ts`**: test nou „kill eșuat (EPERM simulat) nu crapă runner-ul și procesul e oprit oricum” — proces viu care ignoră SIGTERM, `error` emis în timpul `waitForExit`, verifică oprirea garantată; **pică pe codul vechi** cu „Unhandled 'error' event” (§4.14, verificat empiric prin revert temporar). Count total 239 → **240** (README, AGENTS, docs/07).

## [0.3.31] — 2026-08-18, 10:42 EEST

### Adăugat

- **Observabilitate la fetch-ul live** (`live.ts`): fiecare fetch reușit de la Transelectrica loghează acum durata + volumul (`[live] fetch OK: N înregistrări în Xms`) — degradarea endpoint-ului (rate limiting, trunchiere, răspunsuri lente spre timeout-ul de 15s) devine vizibilă devreme în loguri, nu doar la eșec complet (fix TO_FIX **P2-001**).

### Corectat

- **`scripts/dev.sh`: `set -e` activ (fail-fast)** — pasul de refresh e mutat în `if ! python3 ...; then` (comandă condițională, NU declanșează exit la eșec — verificat empiric): invariantul „un refresh eșuat nu blochează pornirea serverului” rămâne garantat, iar orice altă eroare (ROOT/cd/PATH) oprește scriptul imediat, ca serverul să nu pornească dintr-o stare neașteptată (fix TO_FIX **P2-003**).
- **Comentariul `MAX_BACKFILL_MS` scurtat** (`live.ts`): blocul de 8 linii care duplica raționamentul din docs/02 e redus la esențial + referință la documentație (fix TO_FIX **P3-001**).

### Teste

- **`tests/sen/live.test.ts`**: test nou pentru logging-ul de observabilitate (spy pe `console.log` → mesajul conține „2 înregistrări” + durata în ms; pică pe codul vechi fără log — §4.14). Count total 238 → **239** (README, AGENTS, docs/07).

### Notă (claims respinse, documentate)

- **P2-002** (logging parțial live OK / prices FAIL): premisă falsă — `fetch_prices_day` prinde eșecurile de rețea intern și loghează per-zi (`sar peste zi`); `capture_prices` nu aruncă la rețea, deci nu există „eșec prins generic” de distins.
- **P3-002** (timeout 5s `stopMockServer`): deja rezolvat — rescrierea cu SIGKILL + fail-test elimină riscul de EADDRINUSE/proces-vechi; claim-ul era stale.
- **P3-003** (nume `last_ts`): cosmetic; locația din claim (l. 597) e greșită — variabila e la l. 269; impact zero (variabilă locală).

## [0.3.30] — 2026-08-18, 09:05 EEST

### Corectat

- **Plafonul de backfill live ridicat de la 10 la 30 de zile** (`live.ts`, `MAX_BACKFILL_MS`) — garantia documentată „preset-ul de 30 de zile e garantat acoperit" era falsă cu un backfill de 10 zile (fix TO_FIX round 2, claim 4). Endpoint-ul Transelectrica răspunde corect pe 30 de zile (verificat empiric: 4374 puncte în ~323ms, confortabil sub timeout-ul de 15s). Acum preset-urile „7 zile" ȘI „30 zile" sunt garantat acoperite chiar și cu `data/sen-data.json` stale.
- **Fallback-ul pe static gol folosește acum întregul plafon** (`live.ts`, funcția pură nouă `lastStaticTs`): înainte, cu `data/sen-data.json` gol, fereastra live era doar `now − 26h` (constantă `now − 24h` + overlap 2h) — preset-urile 3d/7d/30d apăreau aproape goale la prima rulare. Acum e `now − MAX_BACKFILL_MS` (30 de zile) — fereastra completă configurată (fix TO_FIX round 2, claim 5).
- **`sen-summary.json` e reconstruit din records valide când e lipsă/corupt** (`scripts/convert-sen.py`, `ensure_summary_from_data` apelat în `--refresh-if-stale` după `--fetch` + `--capture-prices`): dacă live-ul eșuează (rețea) sau întoarce doar timestamps duplicate, `refresh_from_live` iese devreme fără să scrie — summary-ul rămânea corupt, `is_data_stale` rămânea True la fiecare pornire, iar `/api/sen/summary` ar fi dat 500 (fix TO_FIX round 2, claim 2).
- **`endTs` NaN/Infinity în summary e tratat ca stale** (`is_data_stale` + `math.isfinite`): înainte, `nan > 24` e False → datele păreau veșnic „proaspete" și refresh-ul nu mai rula niciodată (fix TO_FIX round 2, claim 3).
- **Teste anti-flaky pentru mock server-e** (`tests/dev-refresh.test.ts`, `waitForServer`): subprocesul `--refresh-if-stale` pornește doar după ce ambele mock server-e (live + prețuri) acceptă conexiuni — race-ul dintre spawn și bind putea produce „No new records" intermitent (fix TO_FIX round 2, claim 6).

### Documentație

- **`docs/.docs-manifest.json`**: `tests/dev-refresh.test.ts` adăugat în `covers` pentru docs/07 (era documentat dar netrasat în manifest — garda de staleness nu-l acoperea; fix TO_FIX round 2, claim 1).
- **docs/02**: contractul de backfill actualizat (30 de zile, verificat empiric 4374 puncte); modulul `--refresh-if-stale` documentat cu reconstrucția summary-ului + `endTs` non-finit.
- **docs/07**: count-uri 234 → **238** (13 fișiere); rândul `live.test.ts` extins (`lastStaticTs`, plafon 30 de zile); rândul `dev-refresh.test.ts` extins (NaN/Inf, summary reconstruit, readiness probe).
- **README/AGENTS**: count-uri teste 234 → 238.

## [0.3.29] — 2026-08-17, 12:42 EEST

### Adăugat

- **Auto-refresh la pornirea serverului de dev (Varianta A)** — `bun run dev` aduce acum datele la zi dacă sunt vechi, ca localhost să se comporte ca online (exact ce fac workflow-urile GitHub în producție):
  - **`scripts/convert-sen.py` — modul nou `--refresh-if-stale`**: dacă `is_data_stale(24h)` (endTs-ul din `sen-summary.json` mai vechi de 24h, sau fișier lipsă/corupt), rulează `--fetch` + `--capture-prices`; dacă datele sunt proaspete, **nu atinge rețeaua** (pornire instant). Funcția pură `is_data_stale(max_age_h)` e testabilă determinist.
  - **Invariantul critic**: orice eroare neașteptată e prinsă intern și iese cu **exit 0** — un eșec al refresh-ului NU blochează niciodată pornirea serverului („warning, nu blocker"), verificat prin test dedicat cu summary corupt.
  - **`scripts/dev.sh` (nou)** — wrapper pentru `bun run dev`: rulează `--refresh-if-stale`, apoi pornește `next dev -p 3000 2>&1 | tee dev.log` (pipeline-ul identic cu scriptul vechi). Autosuficient: prepend-ează `node_modules/.bin` în PATH (verificat empiric: `bun run` în modul fișier nu adaugă binarele locale) — `next` se rezolvă indiferent de mediul de rulare. `package.json`: `"dev": "bash scripts/dev.sh"`.
  - **Env-uri overridable noi** (pattern existent `SEN_STORAGE_*`/`SEN_PRICES_*`): `SEN_DATA_OUT`, `SEN_SUMMARY_OUT`, `SEN_LIVE_URL` — testele nu ating niciodată datele reale din `data/`.

### Teste

- **`tests/dev-refresh.test.ts` (nou, 4 teste)**: `is_data_stale` (proaspăt → False, vechi/lipsă/corupt → True), flux complet cu mock server + fișiere temp (date proaspete → zero rețea + neschimbat; date vechi → endTs actualizat + exit 0; summary corupt → tot exit 0 — invariantul wrapper-ului). Count total 230 → **234** (README, AGENTS, docs/07).

### Corectat (documentație)

- **README/AGENTS**: `bun run dev` descris cu auto-refresh; structura `scripts/` include `dev.sh`; count-uri teste 230 → 234.
- **docs/02**: modulul `--refresh-if-stale` documentat (prag 24h, exit 0 garantat, env-uri noi).
- **docs/07**: rând nou `dev-refresh.test.ts` în tabel; count-uri 230 → 234 (13 fișiere).

## [0.3.28] — 2026-08-17, 12:17 EEST

### Corectat

- **Preset-urile de interval arată acum exact zilele promise — gaura dintre static și live eliminată** (bug raportat: „7 zile” afișa doar ~4 zile de date). Cauza: `MAX_BACKFILL_MS` (fereastra de fetch live) era plafonat la 3 zile, iar `data/sen-data.json` era stale (înghețat pe 9 aug, workflow-ul `data-refresh` nu rulase) → 5 zile fără niciun punct între static și live. Fix în două părți:
  - **Runtime (`live.ts`)**: `MAX_BACKFILL_MS` 3 → **10 zile** (endpoint-ul Transelectrica răspunde corect pe 10 — verificat empiric: ~1478 puncte). Fereastra de fetch e centralizată în funcția pură nouă `liveBackfillFrom(lastStaticTs, now)` (testabilă determinist). Invariantul restabilit: orice fereastră ≤ 10 zile e garantat acoperită de live, indiferent de vârsta staticului.
  - **Date locale la zi (pipeline oficial, §4.3)**: `bun run data:refresh` — `data/sen-data.json` 5.606 → **6.792 înregistrări** (interval 01.07 → 17.08); `--capture-prices` — prețurile PZU la zi (ultima zi 17 aug, era 15 aug).
- **Test de regresie (§4.14)** pentru fereastra live: `liveBackfillFrom` cu static stale de 8 zile trebuie să întoarcă o fereastră ≥ 7 zile — pică pe codul vechi (3 zile → 3.0 zile < 7, verificat), trece pe cel nou (8.1 zile). Plus: plafonul 10 zile respectat (static foarte vechi) și overlap 2h cu static proaspăt (fără backfill inutil). Count total 227 → **230** (README, AGENTS, docs/01, docs/07).
- **Prospețimea pe termen lung — constatare, nu fix de cod**: repo-ul local **nu are remote GitHub** (`git remote -v` gol), deci workflow-urile `data-refresh`/`storage-capture`/`price-capture` nu pot rula — asta e cauza staticului înghețat, nu un bug de script (workflow-urile sunt corecte). Pentru ca datele să rămână la zi automat, repo-ul trebuie împins pe GitHub cu Actions activat. Istoricul de stocare (ISPOZ) de pe 9 aug e irecuperabil (snapshot-uri orare pierdute) — se reface doar când cron-ul orar reia.

### Corectat (documentație)

- **docs/02**: contractul de backfill runtime documentat (10 zile, `liveBackfillFrom`, motivația fix-ului); count 5.606 → 6.792.
- **README/AGENTS/docs/01**: count-uri înregistrări (5.606 → 6.792) și interval (01.07 → 17.08); count teste 227 → 230.
- **docs/07**: rândul `live.test.ts` extins cu `liveBackfillFrom` (fereastra „7 zile” cu static stale); count-uri 227 → 230.

## [0.3.27] — 2026-08-16, 08:21 EEST

### Corectat

- **Testul `capture-prices` nu mai depinde de data curentă (CI era roșu în orice zi ≠ 15 aug)**: seed-ul hardcoda „azi e 15 aug"; acum ambele date din seed sunt derivate din timpul curent în fusul României (acum-30 zile + ieri, ancorate la prânz UTC — DST-safe), iar assertions folosesc aceleași date — testul trece în orice zi.
- **`merge_prices` nu mai crapă pe record-uri malformate din `data/sen-prices.json`** (`date: None` → `TypeError` la sortare; prețuri ne-numerice/NaN ar fi poluat fișierul): validare strictă la citire (`_valid_price_record` — date string + prețuri finite) + test de regresie cu cazul real.
- **`customRangeToBoundaries` respinge acum date inexistente și range-uri fără suprapunere**: `new Date("2026-02-30")` se normalizează silențios la 2 martie (V8/JSC) — parse strict `YYYY-MM-DD` + round-trip prin `Date.UTC`; iar un range integral înaintea/după serie producea interval inversat (`from > to`) în loc de `null` — acum `null` după clamp. 3 teste noi (inclusiv perechea `2026-02-30 → 2026-03-05` care eșuează întâi corect pe codul nemodificat).
- **Zilele DST (23/25 de intervale) sunt respinse la parse-ul prețurilor PZU** (decizie confirmată): `priceForHour` indexează `prices[hour]` pozițional, deci un număr diferit de 24 intervale ar decala prețurile cu o oră — „prețuri indisponibile" e mai bine decât prețuri greșite. Docstring-urile `PriceDay`/`priceForHour` + docs/02/04 aliniate (eliminată „limitarea cunoscută… se rezolvă la octombrie").
- **`coveredHours` numără ore unice, nu puncte**: la granularități sub-orare (10m/raw, 6 puncte/oră) `coveredHours` depășea `totalHours` (nonsens) — acum numără orele unice cu preț (Set), invariantul `coveredHours ≤ totalHours` + test de regresie.
- **Tooltip-ul balanței afișează „Sold net" și la valoarea 0**: `hideZero` ascundea și rândul real la echilibru perfect — rămâne doar `hideKeys` (seriile de fill), fără `hideZero`.
- **`Filters`/`RangePicker` reutilizează `customRangeToBoundaries`** în loc de `Date.UTC` inline duplicat (granițe + clamp într-un singur loc, comportament identic — `toISOString().slice(0, 10)` e echivalent cu getters UTC).
- **Calendarul range muta ziua aleasă cu una în urmă pentru utilizatorii UTC+3 (România)** (bug pre-existent, descoperit la review): react-day-picker produce miezul nopții LOCAL, iar conversia prin `toISOString().slice(0, 10)` lua ziua UTC → click pe „15 aug" devenea „2026-08-14" (intervalul începea cu o zi mai devreme). Fix: `toLocalDateKey` — cheia `YYYY-MM-DD` din componentele LOCALE (`getFullYear/getMonth/getDate`), folosită de ambele onSelect; test de regresie care eșuează pe codul vechi în EEST și trece identic în ambele fusuri pe cel nou.
- **`toLocalDateKey` mutată din `format.ts` în modul nou client-safe `src/lib/sen/calendar.ts`**: `format.ts` afișează datele sursă strict prin getters UTC (contract fake-UTC, AGENTS §4.7) — input-ul calendarului trăiește în fusul LOCAL al browser-ului, deci separarea modulelor ține contractul UTC-only al lui `format.ts` intact (prevenire: un agent viitor care vede getters locali în `format.ts` ar putea „repara" funcția înapoi la UTC și reintroduce off-by-one-ul). Importuri actualizate (`Filters`, `RangePicker`, test) + barrel `index.ts` extins.
- **Testul `capture-prices` construiește `roToday` din `formatToParts()`** (robust — formatul exact al `Intl.DateTimeFormat.format()` cu locale-ul `en-CA` nu e garantat de spec, doar `formatToParts` e): funcționează identic pe Bun și Node azi, dar nu mai depinde de un format de ieșire ne-garantat.
- **Manifest docs**: `range-picker.tsx` adăugat și la covers-ul `docs/08-harta-cautare.md` (era documentat acolo dar lipsit din manifest — `docs:check` nu l-ar fi marcat stale la modificări).
- **Teste de caracterizare pentru `customRangeToBoundaries`/`parseIsoDate`** (4 teste noi): ziua 00 respinsă, lunile cu 30 de zile resping 31 (round-trip), an bisect (`2024-02-29` acceptat vs `2026-02-29` respins), an < 100 respins sigur (`Date.UTC` special-case 0-99 → 1999). Comportamentul era deja corect în cod (verificat empiric pe ambele runtime-uri) — testele fixează contractul de parse strict pentru input-ul utilizatorului; count total 223 → 227 (README, AGENTS, docs/07).
- **Igienă**: eliminată împărțirea inutilă la `1` în `computeCosts` (`(p.sold * hours) / 1` → `p.sold * hours`) — cod mort fără impact funcțional (matematic identic), identificat la code-review (micro-smell).

### Corectat (documentație)

- **README**: `costs.ts` nu mai e descris cu „cache TTL" (e pur — doar `prices.ts` are cache) — corectat atât în diagrama de flux (l.101) cât și în proză (l.111).
- **docs/05**: `ThemeToggle` avea celule lipite de rândul `ChartTooltip` (7 celule vs header de 3 coloane) — rând propriu; descrierea `hideZero`/`hideKeys` actualizată la comportamentul nou.
- **docs/07**: „(7 fișiere)" în `tests/sen/` → 8; count-urile de teste 216 → 223 peste tot (README, AGENTS, docs/07).
- **docs/08**: adăugat rândul `RangePicker` în harta UI (lipsea).

## [0.3.26] — 2026-08-15, 06:35 EEST

### Adăugat

- **Costul estimat al importurilor/exporturilor (PZU)** — în cardurile „Consum vs. Producție" și „Balanța energetică (Sold)" apar acum rânduri de rezumat de înălțime egală (simetrie vizuală): **cost import / venit export / sold net** pe intervalul selectat, plus media consum/producție și vârful de consum în celălalt card.
- **Sursa de prețuri**: export CSV public OPCOM (prețuri PZU orare în €/MWh, fără cheie/API/înregistrare — la fel ca Transelectrica pentru datele fizice), format verificat pe 15 probe live (istoric din noiembrie 2025, weekend, DST de primăvară 23 intervale, zile viitoare → payload gol, robots permis, fără rate limit).
- **`.github/workflows/price-capture.yml`** — cron zilnic (11:00 UTC ≈ 13:00–14:00 RO, după publicarea PZU) care rulează `--capture-prices` (backfill automat ~35 zile, idempotent) și comite `data/sen-prices.json`.
- **`src/lib/sen/costs.ts`** — funcții pure (`priceForHour`, `computeCosts`, `intervalStats`) pentru cost = MWh import × preț PZU orar; **`src/lib/sen/prices.ts`** — loader server-only cu cache TTL.
- **`GET /api/sen/costs?from&to`** + hook client `use-sen-costs` + componenta reutilizabilă `ChartSummary` (footer simetric în carduri).
- **Eticheta de onestitate** permanentă: _„Estimare bazată pe prețurile PZU (day-ahead); costul real include intraday și echilibrare."_
- 19 teste noi (`tests/sen/costs.test.ts`, `tests/capture-prices.test.ts`) — total **216** (inclusiv invariantul `totalHours` = ore unice din interval, nu zile + `formatRangeLabel`).

### Corectat

- **`totalHours` subnumăra orele la granița de lună (bug logic real)**: cheia de dedupe din `computeCosts` (an×10000 + lună×100 + zi×24 + oră) COLIDA — ex: 19 iul 14:00 == 15 aug 10:00 (20261070), ambele în preset-ul real de 30 de zile (verificat empiric: 100 coliziuni într-o fereastră de 30 de zile) → `totalHours` raportat de `/api/sen/costs` era mai mic decât numărul real de ore. Fix: cheie = indicele UTC de oră (`Math.floor(ts / 3_600_000)` — unică global, verificată pe 60 de zile) + test de regresie cu perechea colizionantă. Impact vizibil: doar câmpul `totalHours` din API (cardul afișează doar cost/venit/sold net — neschimbat).
- **AGENTS.md rămăsese la count-ul vechi de teste (179)**: actualizat la 216 + workflow-ul `price-capture.yml` adăugat în lista de workflow-uri; CHANGELOG corectat (count-urile „202"/„203" → 216, era 179).

### Corectat (UX)

- **Graficul „Consum vs. Producție" era o „linie verticală"** (SVG colapsat la ~21px): zona de chart din `SectionCard` avea `flex-1`, iar flex-shrink-ul o comprima la conținutul textului când grid-ul calcula rândul → Recharts măsura ~21px. Fix: `shrink-0` + înălțime fixă — graficele au acum dimensiunea completă (300px), cu date reale (problema era preexistentă pe HEAD 0.3.25, confirmat pe worktree separat).
- **Linia „Producție" nu mai atinge/trage prin etichetele de dată** (ex: „12 aug"): `DemandSupplyChart` și `BalanceChart` au acum `margin.bottom: 20` — spațiu garantat între zona de plot și etichetele X (producția coboară spre ~3.200 MW noaptea, iar cu `bottom: 0` linia verde ajungea la nivelul textului).
- **Numerele de la „Balanța energetică" au acum context explicit**: footer-ul (`ChartSummary`) afișează titlul de perioadă (ex: „Ultimele 7 zile · 8–15 aug 2026") deasupra valorilor, ca utilizatorul să știe pe ce termen sunt calculate costurile; notele explicitează unitățile („mil €") și că e o estimare PZU (intraday + echilibrare nu sunt incluse).
- **Footer-ul „Consum vs. Producție"** primește același titlu de perioadă (simetrie) + unitatea „MW" lângă medii/vârf.

### Adăugat (UX)

- **Selectarea perioadei personalizate**: butonul „Personalizat" din bara de filtre deschide un calendar range (react-day-picker, deja în proiect) constrâns la datele disponibile; intervalul ales se aplică imediat (granițe UTC, zile întregi), **persistă la refresh** (`sen:custom-range`) și e reflectat în footer-urile cardurilor (ex: „Personalizat · 9–13 aug 2026").
- **Selector de perioadă direct pe carduri** (`RangePicker` în `range-picker.tsx`): cele două carduri pereche („Consum vs. Producție" / „Balanța energetică") au acum în header un buton compact cu perioada activă (ex: „7 zile" / „9–13 aug 2026") care deschide același control ca bara de filtre — preset-uri rapide + calendar range — cu starea partajată (schimbi de oriunde, se sincronizează peste tot). Fără să te întorci sus la filtre, fiecare grafic își poate schimba intervalul direct.

### Corectat (UX)

- **Tooltip-ul „Balanței energetice" afișa „Sold" de 3 ori / valoare duplicată**: seriile de fill pentru gradient (`soldImport`/`soldExport`, clamate la 0 pe celălalt semn) apăreau în tooltip ca rânduri separate („Import"/„Export") cu aceeași valoare ca „Sold net" — sau ca zerouri constante. Fix: `ChartTooltip` suportă acum `hideKeys` (excludere pe cheie) + `hideZero`; balanța exclude explicit seriile de fill → tooltip-ul arată doar seria reală („Sold net"), cu nume distincte și fără zerouri.
- **Graficul mare „Producția pe surse" era comprimat vertical (SVG 360px, gol dedesubt)**: fix-ul anterior pentru cardurile de jos (`shrink-0` + înălțime fixă) blocase și cardul mare la `chartHeight` fix, deși rândul lui e împins de coloana laterală (Mixul curent + Stocare = ~800px). Fix: prop nou `stretch` pe `SectionCard` (`flex-1` + `min-height`) — graficul mare se întinde din nou să umple rândul (~696px, ca pe HEAD), iar cardurile de jos rămân la 300px fix. Verificat pe HEAD în worktree separat.
- **Linia de consum lipsea din graficul mare (bug preexistent)**: `<Line>` nu se randează deloc în interiorul unui `AreaChart` în recharts 2.15.4 (verificat în izolare pe SSR + în browser, prezent și pe HEAD 0.3.25) — subtitlul promitea „vs. consum (linie punctată)", dar linia nu apărea. Fix: `AreaChart` → `ComposedChart` (există exact pentru a combina arii stivuite + linii). Acum graficul are 7 arii + linia de consum punctată deasupra.
- **Soldul/valorile real-time „blocate" (bug real descoperit live, NU introdus de modificările recente)**: `parseInstantTimestamp` din `instant.ts` cerea ora cu 2 cifre (`\d{2}`), dar Transelectrica NU face zero-padding la oră când e < 10 — payload real `"26/8/15 8:10:33"` era respins → `getInstantData()` → `null` → UI-ul cădea pe seria istorică (~08:00) și soldul părea înghețat deși pe site-ul oficial se mișcă. Fix: regex permisiv `\d{1,2}` pentru oră/minut/secundă (range-urile rămân validate explicit) + test de regresie pe formatul real capturat. Verificat pe payload live: `getInstantData` întoarce din nou date (sold −308 MW, t = 08:11:06) și header-ul arată ora real-time.
- **Linia de consum nu era identificabilă ca „Consum" (UX)**: pe graficul mare linia punctată nu avea nicio etichetă — acum are **etichetă „Consum" lângă ultimul punct** (`LabelList` copil al `Line` cu `content` custom, culoarea seriei — eticheta e în SVG, nu ocupă spațiu vertical) + **intrare „Consum" în legenda comună** de sub grid (`SourceLegend`, linie punctată `SERIES_COLORS.consum`, element static — consumul nu e sursă, deci fără hover). Deliberat NU în interiorul cardului: ar fi furat spațiu din înălțimea graficului. Graficul rămâne la înălțimea completă (696px).

### Adăugat (teste de regresie pentru logică UI)

- **`src/lib/sen/tooltip.ts`** — funcția pură `buildTooltipRows` (filtrare/sortare/mapare rânduri tooltip) extrasă din `ChartTooltip`: componenta doar randează, logica (care a avut 2 bug-uri reale: seriile de fill ale balanței ca „Import"/„Export" duplicate + zerouri constante) e acum testabilă fără RTL, model `buildLegendRows`. 8 teste noi în `tests/sen/tooltip.test.ts` (`hideZero`, `hideKeys`, `showTotals`, intrări nenumerice, payload gol, fallback nume/unit/color, sortare).
- **`customRangeToBoundaries`** în `format.ts` — logica intervalului personalizat (calendar range → granițe UTC `00:00`→`23:59:59.999`, clampate la datele disponibile, `null` la input invalid) extrasă din `page.tsx`; 4 teste noi în `tests/sen/format.test.ts`. Total **216 teste** (era 179).

### Notă

- Costul e în **milioane EUR** (prețurile OPCOM sunt în €/MWh); conversia în lei (curs BNR zilnic) rămâne pentru o versiune viitoare.
- Dacă prețurile lipsesc (OPCOM indisponibil), cardurile afișează doar volumele — site-ul nu se rupe.

## [0.3.25] — 2026-08-14, 06:40 EEST

### Adăugat

- **Legenda `SourceDistribution` afișează mereu toate cele 7 surse** (`src/lib/sen/constants.ts` + `src/components/dashboard/source-distribution.tsx`): funcție pură nouă `buildLegendRows(latest?)` care derivează toate sursele din `SOURCE_ORDER` cu `label`/`color`/`hint` din `SOURCES` + `value` și `isZero` (`value <= 0`). Vechiul `.filter(d => d.value > 0)` scotea din legendă orice sursă la 0 MW (ex: foto noaptea, nuclear la oprire) — utilizatorul vedea un donut cu 6 felii și un rând lipsă, fără indicație că a 7-a sursă există.
- **Zero-state în legendă**: sursele la 0 apar cu cerc gol (○, `border-border/40`), `opacity-50`, valoare `0`, procent `—` (în loc de `0,0%`) și tooltip `title={hint}` la hover. Donut-ul rămâne neschimbat (filtrează `> 0`); empty-state-ul „Nicio înregistrare” rămâne pe `!latest`.

### Testat

- **5 teste noi** în `tests/sen/source-distribution.test.ts` (regula 4.14): 7 rânduri mereu chiar cu o sursă la 0 (vechiul cod dădea 6), `isZero` la 0 MW vs când produce, `undefined` → 7 rânduri zero, ordinea `SOURCE_ORDER` păstrată, `label`/`color`/`hint` din `SOURCES`. Total: **174 → 179 teste** (9 fișiere), verzi în ambele fusuri.

### Documentat

- `docs/05` (zero-state în descrierea `SourceDistribution`), `docs/04` + `docs/06` (`buildLegendRows` documentată), `docs/07` (rând nou în tabel + count), README/AGENTS (count teste 179).

### Reparat

- **Fixuri TO_FIX (validate pe cod, 4/5)**: rândurile de legendă la zero devin elemente noninteractive (`<div>`, non-focusabile, fără hover-store) — non-zero rămân `<button>` cu `onFocus`/`onBlur` (a11y: un buton focusabil fără acțiune e anunțat greșit de screen-reader); `ts`-ul fixture-ului din `source-distribution.test.ts` corectat la `1_786_708_800_000` ca să corespundă cu `t` (`2026-08-14T12:00:00.000Z`, era decalat 29,5 zile); manifest extins cu `tests/sen/source-distribution.test.ts`; `docs/07` corectat „tests/sen/ (5 fișiere)” → „(6 fișiere)”. Claim-ul 3 (mutarea copy-ului „Nicio înregistrare” într-o locație shared) respins — nu există locație shared de copy în proiect, ar fi over-engineering.

## [0.3.24] — 2026-08-13, 17:02 EEST

### Reparat

- **Erorile HTTP non-5xx erau reîncercate în `fetchLiveReadings`** (`src/lib/sen/live.ts`, TO_FIX): un răspuns 4xx (ex: 403/404) arunca în interiorul `try`, dar catch-ul nu îl distingea de un eșec tranzitoriu → primea a doua încercare, deși comentariul din cod spunea că 4xx e determinist („n-ar ajuta”). Acum răspunsurile non-5xx sunt marcate `retryable: false` și re-aruncate imediat în catch; retry-ul rămâne doar pentru 5xx, rețea, timeout și body-stream. Teste de regresie noi (§4.14): 4xx → exact 1 apel, 0 reîncercări (pica pe codul anterior: 2 apeluri); 5xx → 1 retry apoi reușită.
- **Același bug de retry pe 4xx exista și în `fetchCurrentInstant`** (`src/lib/sen/instant.ts`, găsit la code review după fix-ul din live.ts): un 4xx de la `/sen-filter` era reîncercat (catch-ul re-arunca doar `/payload invalid/`). Aplicat același pattern `retryable: false` + test de regresie (4xx → 1 apel, 0 reîncercări).
- **Testul `AbortSignal` nu verifica pragul de 15s** (`tests/sen/live.test.ts`, TO_FIX): verifica doar că un `AbortSignal` e pasat la fetch, deci ar fi trecut și cu un timeout de 3s — nu prindea regresii de durată. `mock.timer()` nu există în Bun 1.3.14, deci pragul e verificat determinist prin `spyOn(AbortSignal, "timeout")`: trebuie apelat cu exact `15_000`; fetch-ul mock-uit confirmă că signal-ul e activ (nu aborted) la apel.

### Documentat

- Docs corectate pe baza verificării împotriva codului/datei reale (TO_FIX, toate confirmate):
  - **README**: diagrama stocării declara TTL 10 min, dar `STORAGE_TTL_MS` e 3 min — corectat; intervalul arhivei locale era „1 iulie → în prezent”, dar `data/sen-data.json` se oprește la **9 august 2026** (5.606 înregistrări) — reformulat + refresh-ul incremental zilnic descris separat.
  - **docs/01**: regula de layering menționa doar `loader.ts` ca excepție server-only — acum listează și `live.ts`, `storage.ts`, `instant.ts` (aliniat cu diagrama); intervalul datelor corectat la 09.08.2026.
  - **docs/02**: adnotarea „fallback: summary.latest” era la nivel de route — clarificat că `/api/sen/instant` întoarce snapshot sau `null`, iar fallback-ul îl face UI-ul.
  - **docs/04**: regula de import server-only omitea `instant.ts` — adăugat.
  - **docs/05**: rândul `KpiCards` era lipit de `Filters` în tabel (celule în plus) — separat pe rând propriu.
  - **docs/07**: pipes din invariantul anti-shift ne-escaped (rupeau tabelul) — escaped; descrierea testelor `live.test.ts` actualizată cu 4xx/5xx/AbortSignal; numărul de teste 171 → **174** în README, AGENTS și docs/07; `package.json` → 0.3.24.

## [0.3.23] — 2026-08-13, 15:46 EEST

### Adăugat

- **Valori real-time (Consum/Producție/Sold + mix pe surse)** — site-ul oficial afișează bara „Consum / Producție / Sold” poll-uind `/sen-filter` la fiecare **10 secunde** (verificat în JS-ul lor: `setTimeout("STATE_SEN_Q()", 10000)`); noi foloseam doar seria istorică `sen-grafic` (cadență ~10 min), deci dashboard-ul părea „înghețat” față de al lor. Acum:
  - **Modul nou** `src/lib/sen/instant.ts` (server-only, pattern `storage.ts`/`live.ts`): `parseInstantTimestamp` (`YY/MM/DD HH:MM:SS`, an 2 cifre, range-uri validate), `parseInstantPayload` (coduri SEN → câmpuri interne cu validare numerică strictă + **invariant anti-shift** `|sold − (consum − productie)| ≤ 5 MW` — pe datele reale sunt egali), `fetchCurrentInstant` (timeout 8s + 1 retry pe eșec tranzitoriu), `getInstantData` (TTL 10s + backoff 30s + inflight partajat + **guard prospețime**: snapshot > 30 min → `null`, ca badge-ul să nu mintă că e „live”).
  - **Endpoint nou** `GET /api/sen/instant` (răspunde `null` la eșec/stale — fallback lin, site-ul nu se rupe) + tipul `InstantData` în `types.ts`.
  - **UI**: KPI-urile, Mixul curent și badge-ul Header afișează snapshot-ul real-time când există (`liveLatest`/`latestOverride` în `page.tsx`/`kpi-cards.tsx`, `liveAt` în `header.tsx`), cu fallback pe seria istorică.
- **Polling client (live feedback real)** — revenirea pe tab reîmprospătează, ca pe site-ul lor: `refetchOnWindowFocus: false → true` în `providers.tsx` + `refetchInterval` per hook (`useInstantData` 30s, `useSenSummary` 60s, `useStorageData` 60s, `useSenData`/grafice 5 min).
- **Stocarea mai reactivă**: `STORAGE_TTL_MS` 10 min → **3 min** (cardul primește polling 60s, deci valoarea se actualizează la câteva minute, nu la o sesiune de vizitare).
- **24 de teste unitare noi** (`tests/sen/instant.test.ts`, total **147 → 171**): parser timestamp + payload (inclusiv payload-ul real capturat), round-trip de calendar (30 feb / 31 apr respinse), invariant anti-shift, prospețime, fetch cu retry (1 încercare + 1 retry, fără retry pe payload invalid), cache TTL/backoff/inflight, guard prospețime (snapshot vechi → `null` fără cache). Toate verzi în ambele fusuri; proba pe `/sen-filter` real: invariant exact, snapshot la secunde.

### Documentat

- Docs 01–08 + README + AGENTS sincronizate (arhitectură, pipeline, API, strat de date, UI, teste — numărul de teste 147 → 171 peste tot, endpoint nou în liste, polling documentat); manifestul `docs/.docs-manifest.json` extins cu `instant.ts`, `use-instant-data.ts`, ruta `/api/sen/instant` și `instant.test.ts`; `package.json` → 0.3.23.

## [0.3.22] — 2026-08-13, 14:50 EEST

### Reparat

- **Timeout-ul fetch-ului live era prea strâns (5s → 15s + 1 retry)** (`src/lib/sen/live.ts`): răspunsul real al endpoint-ului Transelectrica e ~3.9s (măsurat), iar 5s dădea timeout fals la orice vârf de trafic → fallback silențios pe seria arhivată (utilizatorul vedea date vechi de zile, ex. „9 august” pe 13 august). Acum: timeout 15s (marjă 4×) + **1 retry cu pauză 1s pe eșec tranzitoriu** (rețea/timeout/HTTP non-OK); validările de payload (gol / shift de coloane) NU se reîncearcă — sunt deterministe. Teste noi: retry-ul aduce datele live după un prim eșec (exact 2 apeluri) + `AbortSignal` activ la fetch.
- **Datele vechi nu mai erau semnalate utilizatorului** (P2): vârsta reală a ultimei înregistrări e acum calculată pur în `format.ts` prin noua funcție `dataAgeMs(iso, now)` (logica candidaților DST `−2h`/`−3h` din `formatRelative` extrasă — același comportament, refactor); pragul de prospețime `LIVE_STALE_THRESHOLD_MS` (30 min) e centralizat în `constants.ts` (§4.5). În `header.tsx`, dacă vârsta depășește pragul, badge-ul devine avertisment chihlimbar cu `TriangleAlert` + text „live indisponibil — date din …”, iar `aria-label` descrie starea — utilizatorul vede clar când datele sunt vechi.
- **Teste**: 140 → **147** (5 noi în `format.test.ts` pentru `dataAgeMs`: offset EEST, viitor negativ, granițe DST toamnă/primăvară, ora ambiguă; 2 noi în `live.test.ts` pentru retry + signal). Toate verzi în ambele fusuri.

### Notă operațională (nu e un bug de cod)

- Seria arhivată `data/sen-data.json` se oprește la 09.08.2026: refresh-ul zilnic e făcut de workflow-ul `data-refresh` (GitHub Actions), care rulează doar cu un remote GitHub configurat. Local, rulezi `bun run data:refresh` pentru a aduce fișierul la zi; la runtime, fix-ul de mai sus reduce drastic apariția datelor vechi (fetch mai tolerant + avertisment vizibil).

## [0.3.21] — 2026-08-13, 11:17 EEST

### Reparat

- **`parseRange` accepta literaluri hex/octal/binary/underscore (`src/lib/sen/aggregate.ts`)** (TO_FIX F-1): `Number("0x10") === 16`, `Number("0b101") === 5` (hex/binary acceptate de `Number()`; `Number("1_000")` e de fapt `NaN` — underscore-ul nu e un format pe care `Number()` să-l accepte) — un `?from=0x10` pe `/api/sen` sau `/api/sen/export` ar fi fost interpretat ca timestamp 16 în loc de fallback, asimetric cu `extract_ispoz`/`extractIspoz` (Python/TS resping aceste formate, doar zecimale + exponent sunt valide). Acum `parseRange` validează cu același regex zecimal (paritate cu `storage.ts`); teste de regresie adăugate (§4.14 — eșuau pe codul anterior: `parseRange("0x10", 100)` dădea 16, acum 100), iar exponentul rămâne acceptat (`1e3` → 1000).
- **`storage.ts` importa `bucharestOffsetMs` prin re-export din `live.ts`** (TO_FIX F-3): la mutarea funcției în `format.ts` (0.3.19), `storage.ts` a rămas cu import din `./live` (care doar re-exportă) în loc de sursa reală `./format` — fragil la o viitoare curățare a re-export-ului. Fix: import direct din `./format`; re-export-ul din `live.ts` rămâne pentru testele existente. Zero schimbare de comportament.

## [0.3.20] — 2026-08-13, 10:45 EEST

### Reparat

- **`formatRelative` cu default `now = Date.now()` ne-determinist (`src/lib/sen/format.ts`)** (claim din review): funcția își păstra un `Date.now()` ascuns ca valoare implicită, deși `bucharestOffsetMs` fusese aliniat la regula de puritate din AGENTS §4.2 (fără `Date.now()` nedeterminist). Acum parametrul `now: number` e obligatoriu — UI-ul (`header.tsx`) trece `Date.now()` explicit la afișarea badge-ului „actualizat", iar testele treceau deja valori fixe. Zero schimbare de comportament.

## [0.3.19] — 2026-08-13, 09:42 EEST

### Reparat

- **Dezambiguizare DST în `formatRelative` (`src/lib/sen/format.ts`)** (TO_FIX): etichetele fake-UTC (wall-clock RO etichetat UTC) erau comparate cu `now` ca și cum ar fi UTC real — vârste greșite cu 1–3h pentru datele din zilele de tranziție DST (ex: o citire etichetată `01:30Z` pe 25 oct avea „acum 1 oră" în loc de „acum 4 ore") și subestimarea vârstei pentru datele mai vechi de 2–3h. Acum funcția candidează ambele offset-uri EET/EEST (+2h/+3h), reține doar candidații self-consistenți (`bucharestOffsetMs(candidat) === offset aplicat`) și alege cel mai recent candidat valid care nu e în viitor față de `now` — uniform în vară și iarnă. Adăugate **3 teste de regresie** (octombrie fall-back ×2, inclusiv ora ambiguă, + martie spring-forward) care eșuau pe codul anterior (§4.14).
- **`parseRange` accepta whitespace-only ca 0 (`src/lib/sen/aggregate.ts`)** (TO_FIX): `Number(" ") === 0`, deci un parametru `?from=%20` pe `/api/sen/export` devenea `0` (epoch 1970) și exporta tot istoricul în loc de fallback — aceeași familie cu bug-ul NaN reparat în 0.3.18. Acum inputul e trim-muit înainte de conversie, iar whitespace-only returnează fallback-ul; aserțiune de regresie adăugată (`parseRange(" ", 100) === 100`).
- **`bucharestOffsetMs` cu default `new Date()` ne-determinist (`src/lib/sen/format.ts`)** (TO_FIX): parametrul e acum obligatoriu (`date: Date`), aliniind funcția cu regula de puritate din AGENTS §4.2 (fără `Date.now()` ascuns). Toți consumatorii (`live.ts`, `storage.ts`, testele) treceau deja o dată explicită — zero schimbare de comportament.
- **Gramatica numărului de teste în documentație** (TO_FIX): „135 teste" → „**138 de teste**" în `README.md` (inclusiv badge-ul de tests), `AGENTS.md` și `docs/07-testing-ci.md` (acolo era încă vechiul 131).

## [0.3.18] — 2026-08-13, 07:55 EEST

### Reparat

- **Exportare helper `parseRange` și adăugare teste de regresie (§4.14)**: exportată funcția `parseRange` din `src/app/api/sen/export/route.ts` și `src/app/api/sen/route.ts` și adăugat suite-ul de teste unitare `parseRange` în `tests/sen/aggregate.test.ts` (verificare că `parseRange("abc", fallback)` returnează fallback-ul fără a propaga `NaN`).
- **Sincronizare documentație suite de test**: actualizat numărul total de teste unitare la 135 în `README.md` și `AGENTS.md`.

## [0.3.17] — 2026-08-13, 06:45 EEST

### Reparat

- **Acuratețe etichetă KPI (`kpi-cards.tsx`)**: schimbat eticheta sub-statisticii din „Media interval” în „Media totală” pe cardurile Consum și Producție pentru a reflecta exact că valoarea reprezintă media pe tot istoricul de date.
- **Badge prospețime în Header (`format.ts`)**: adăugată compensare pentru offset-ul fusului orar al României în `formatRelative` când diferența calculată este negativă (din cauza timestamp-urilor wall-clock RO etichetate UTC), prevenind afișarea eronată „acum câteva secunde” pe date mai vechi.
- **Validare parametru pe export (`/api/sen/export/route.ts`)**: adăugat helper `parseRange` cu `Number.isFinite` pentru sanitizarea parametrilor `from` și `to` pe ruta de export CSV.
- **Curățenie cod și documentație**: eliminat prop-ul mort `order` de pe elementele `<Area>` din `production-mix-chart.tsx`, actualizat numărul total de teste unitare la 133 în `README.md` și `AGENTS.md`, și sincronizată versiunea din `package.json` la `0.3.17`.

## [0.3.16] — 2026-08-12, 11:55 EEST

### Reparat

- **Test fragil la creșterea datelor statice în `tests/sen/live.test.ts`**: înlocuit payload-ul cu dată fixă (`10-08-2026 12:00:00`) cu generare dinamică prin `payloadNewerThanStatic()`, asigurând că suita de teste rămâne 100% rezistentă la actualizarea zilnică automată a fișierului `sen-data.json`.
- **Inconsistență documentație în `README.md`**: aliniat textul de la liniile 5 și 98 din `README.md` cu cel din `docs/01-04` prin specificarea ordinii reale de fallback pe `liveCache` stale (max 24h) înainte de coborârea la date statice.
- **Log precizat în `src/lib/sen/live.ts`**: ajustat mesajul din `console.warn` (linia 248) la eșecul de fetch Transelectrica pentru o mai bună claritate la debugging.

## [0.3.15] — 2026-08-12, 08:19 EEST

### Reparat

- **Subtitle inversat pe cardul Balanța energetică (Sold)** (TO_FIX F-1): textul din `src/app/page.tsx:189` spunea „Pozitiv = export · Negativ = import”, fiind invers față de formula Transelectrica (`SOLD = CONS - PROD`), `AGENTS.md` și restul codului $\rightarrow$ corectat în „Pozitiv = import · Negativ = export”.

## [0.3.14] — 2026-08-11, 16:48 EEST

### Reparat

- **Eșecul temporar de fetch la Transelectrica reseta dashboard-ul la datele din 9 August**: când endpoint-ul live dădea timeout sau era suprasolicitat, `getLiveReadings()` din `src/lib/sen/live.ts` ignora `liveCache`-ul existent în memorie și făcea fallback direct la datele statice `sen-data.json`. Rezolvat prin utilizarea `liveCache`-ului stale existent în memorie (până la o limită de siguranță de 24h, `MAX_STALE_LIVE_TTL_MS`) atunci când un fetch eșuează sau când suntem în perioada de backoff de 1 minut.
- **Documentație și Testare**: actualizate `docs/01-arhitectura.md`, `docs/02-pipeline-date.md`, `docs/03-api.md` și `docs/04-strat-date.md` pentru a descrie ordinea reală de fallback pe `liveCache` stale (max 24h); remediat testul unitar `uses stale liveCache as fallback` din `tests/sen/live.test.ts` (simulare avansare timp > 10 min pentru executarea reală a ramurii de fallback pe cache-ul stale).

## [0.3.13] — 2026-08-11, 05:50 EEST

### Reparat

- **Accesibilitate la tastatură pe elementele legendei din `SourceDistribution`** (TO_FIX F-3): rândurile din legendă erau `<div>`-uri ne-focusabile → transformate în `<button type="button">` cu `onFocus`/`onBlur` pentru declanșarea stării de highlight la navigarea cu tasta Tab.
- **Suport focus de tastatură în `SourceLegend`** (TO_FIX F-5): butoanele aveau doar handler-e de hover (mouse) → adăugat `onFocus` și `onBlur` pentru sincronizarea vizuală `hoveredSource` la navigarea cu tasta Tab.
- **Tabelul din `docs/05-ui-dashboard.md` avea un rând spart pe 4 coloane** (TO_FIX F-2): caracterul `|` dintre Producție și Consum în descrierea `ChartTooltip` era ne-escapat → escapat ca `\|`, restabilind structura canonică de 3 coloane.
- **Stacking z-index inconsistent în `StorageCard`** (TO_FIX F-4): doar antetul avea `relative z-10`, iar secțiunea de valori/trend și sparkline-ul aveau poziționare implicită → adăugat `relative z-10` pe toate wrapper-ele de conținut pentru o aliniere stratificată garantată deasupra glow-ului ambiental.
- **Manifestul de acoperire al documentației omitea 3 fișiere noi** (TO_FIX F-1): `src/hooks/use-hover-store.ts`, `src/components/dashboard/source-legend.tsx` și `src/components/dashboard/global-hover-sync.tsx` adăugate în harta `covers` a documentului `docs/05-ui-dashboard.md` din `docs/.docs-manifest.json`.

## [0.3.12] — 2026-08-10, 21:20 EEST

### Reparat

- **Timestamp-ul numeric brut în tooltip-ul Recharts afișa un număr uriaș**: pe axa de timp X, valoarea `ts` (epoch ms) era tratată de `formatLabel` ca număr obișnuit cu separatori de mii (ex: `1,723,456,789,000`). Corectat prin adăugarea prop-ului `labelFormatter` și detectarea automată a timestamp-urilor numerice în `ChartTooltip` (`chart-tooltip.tsx`), afișând data/ora formatată curat și adaptată la granularitate.

### Adăugat

- **Optimizare performanță hover highlight (60 FPS fără lag React)**:
  - Legenda surselor extrasă în componentă izolată `SourceLegend` (`src/components/dashboard/source-legend.tsx`), ordonată descrescător după valoarea curentă a producției și deconectată de `page.tsx`.
  - Componentă invizibilă `GlobalHoverSync` (`src/components/dashboard/global-hover-sync.tsx`) ce sincronizează `hoveredSource` din Zustand cu atributul `data-hovered-source` de pe `<body>`.
  - Selectori CSS în `src/app/globals.css` pentru evidențiere hardware-accelerated (`.area-[sursa] path` și `.pie-[sursa]`), eliminând re-randarea inutilă a graficelor mari la hover.
- **Sumar Producție & Consum în antetul tooltip-ului**: `ChartTooltip` suportă acum `showTotals={true}`. În `ProductionMixChart`, antetul afișează Producția Totală și Consumul Total în MW alături de dată, iar linia de consum e filtrată automat din rândurile individuale pentru a evita duplicarea.
- **Documentație**: `docs/05-ui-dashboard.md` actualizat cu detaliile componentelor `SourceLegend`, `GlobalHoverSync` și noile capabilități `ChartTooltip`.

## [0.3.11] — 2026-08-10, 11:22 EEST

### Reparat

- **Branch-ul țintă pentru rebase/push în workflow-uri folosea `git branch --show-current`, gol pe detached checkout** (TO_FIX F-1): `actions/checkout@v4` face checkout la SHA (detached HEAD), deci comanda întorcea șir gol → fallback pe `main`. Pe cron mergea corect (default branch), dar la `workflow_dispatch` manual pe un branch non-main (ex: `updates`), rebase-ul și push-ul ar fi țintit greșit `main`. Fix în `storage-capture.yml` și `data-refresh.yml`: `BRANCH="${GITHUB_REF_NAME:-main}"` — variabila GitHub e setată corect chiar și pe detached checkout (default branch la `schedule`, branch-ul selectat la `workflow_dispatch`).
- **Pragul de trend al cardului de stocare era hardcodat în componentă** (TO_FIX F-2): `0.5` (MW) apărea direct în `storage-card.tsx` pentru eticheta/iconița de trend, nu în `constants.ts`. Mutat în `STORAGE_TREND_THRESHOLD_MW` (în `constants.ts`, alături de `STORAGE_COLOR`) și importat în card — inclusiv a treia apariție a pragului din culoarea textului, pe care auditul nu o listase. Regula aplicabilă e AGENTS §4.5 (sursa unică pentru surse și constante de business — extinsă explicit cu ocazia acestui fix ca să acopere și constantele numerice, nu doar culorile/etichetele). Zero schimbare de comportament (aceeași valoare).
- **Comentariul `STORAGE_TTL_MS` sugera o relație inexistentă** (TO_FIX F-3): „10 minute — frecvența de captură a workflow-ului" — dar captura `storage-capture` e orară (1/h), iar TTL-ul de 10 min e doar pentru snapshot-ul live la `/sen-filter`. Comentariu reformulat ca să distingă clar cele două (TTL live vs captură orară independentă).

## [0.3.10] — 2026-08-10, 08:30 EEST

### Reparat

- **Sparkline-ul cardului de stocare se scala cu lățimea cardului în loc să aibă înălțimea fixă de 48px** (TO_FIX F5): `<svg className="h-full w-full">` își rezolva `height: 100%` contra unui wrapper `div.mt-4` fără înălțime explicită → cădea pe aspect-ratio-ul viewBox-ului (100:48), deci pe un card de ~320px sparkline-ul randa la ~153px. Fix: `h-12` (48px) pe wrapper-ul din `storage-card.tsx` — `h-full` se rezolvă acum la 48px, `viewBox`/`preserveAspectRatio` neschimbate (proporții identice). Verificat empiric în Chrome: fără fix 153.6px → cu fix 48px.

## [0.3.9] — 2026-08-10, 07:48 EEST

### Reparat

- **`continue-on-error: true` masca erorile reale din workflow-uri** (TO_FIX F2): step-urile de fetch din `storage-capture.yml` și `data-refresh.yml` raportau orice eroare de script ca simplu warning, iar rularea rămânea verde — problemele persistente (bug de script, eroare de scriere) treceau neobservate. Eliminat: un eșec tranzitoriu de rețea e deja tolerat **intern de script** (`capture_storage` / `fetch_live` prind `URLError`/`Exception` și ies cu 0 → step-ul de commit nu găsește schimbări), iar o eroare reală iese acum non-zero → vizibilă în Actions.
- **Timestamp-ul valorii live de stocare era decalat cu durata fetch-ului** (TO_FIX F3): `getStorageData` construia `t`/`fetchedAt` din `now`-ul capturat **înainte** de `await inflightFetch` — la un fetch lent (până la 5s), ora afișată și baza TTL-ului de 10 min erau cu câteva secunde în urmă. Acum momentul e recalculat după fetch.
- **`Sparkline` recalcula `gid`/`path` la fiecare render** (TO_FIX F4): array-ul `points` era recreat la fiecare render (`history.map(...)`), făcând `useMemo`-urile din `Sparkline` ineficiente. Acum `points` e memoizat pe referința stabilă `history`.

## [0.3.8] — 2026-08-10, 06:36 EEST

### Reparat

- **Eșecurile reale de persistare ale workflow-urilor erau raportate ca succes** (TO_FIX #1-3): `storage-capture.yml` și `data-refresh.yml` ieșeau cu `exit 0` („verde") la rebase eșuat, commit eșuat cu schimbări staged și push epuizat după 3 încercări — monitoring-ul nu vedea niciodată problemele de sincronizare. Acum:
  - **Rebase eșuat** (inițial + la retry) → `exit 1` (workflow-ul devine roșu în Actions). Recuperarea diferă între workflow-uri: la **data-refresh** datele se recuperează la următoarea rulare (fetch-ul e incremental de la `last_ts`, deci backfill posibil); la **storage-capture** snapshot-ul orei pierdute e **irecuperabil** (următoarea captură e o valoare nouă — nu reconstruiește ora eșuată), motiv pentru care eșecul trebuie să fie vizibil.
  - **Commit eșuat cu schimbări staged** → `::error::` + `exit 1` (nu mai e mascat ca „Nothing to commit"); „Nothing to commit" se raportează doar când `git diff --cached --quiet` e gol.
  - **Push epuizat după 3 încercări** → `::error::` + `exit 1` (era `exit 0`).
  - Auto-heal-ul (reluarea automată la următorul cron — nu reconstruiește ora pierdută la storage-capture, vezi mai sus) și curățarea (`git rebase --abort`) rămân identice — s-a schimbat doar exit code-ul pe căile de eșec real.

## [0.3.7] — 2026-08-10, 05:52 EEST

### Reparat

- **Timestamp-ul capturilor de stocare era cu 2-3h în urmă față de eticheta `t`** (TO_FIX #6): `capture_storage` din `scripts/convert-sen.py` și snapshot-ul live din `storage.ts` calculau `ts` ca **instant-ul local real** (`now.timestamp()`), dar `t` e wall-clock România **etichetat UTC** — cele două nu se potriveau (ex: `t` zicea `18:18Z` dar `ts` corespundea lui `15:18Z`), inconsistente cu restul pipeline-ului (fake-UTC, vezi `parse_ts`/`make_record`). Acum ambele folosesc **epoch-ul UTC al valorii etichetate** (`parse_ts` în Python, `Date.parse(t)` în TS). Punctele existente din `data/sen-storage.json` au fost migrate (`ts = epoch(t)`).
- **`extractIspoz` accepta gol/whitespace/null/array ca 0** (TO_FIX #8): `Number("") === 0`, `Number(null) === 0`, `Number([]) === 0` — un payload cu `ISPOZ: ""` (sau `null`, `[]`) era tratat ca „stocare 0 MW" în loc de invalid. Acum aceste valori sunt respinse **înainte** de `Number()`, consistent cu `extract_ispoz` din Python (care le respinge prin excepție). Bonus de paritate cu `float()`: și string-urile hex/binary/octal (`"0x10"`, `"0b101"`) — pe care `Number()` le-ar accepta — sau cu underscore (`"1_000"` — pe care `Number()` îl respinge oricum, dând `NaN`) sunt respinse (regex de zecimale), ca Python.
- **`merge_storage` crăpa cu KeyError la un record cu `t` dar fără `ts`** (TO_FIX #5): `sorted(..., key=lambda x: x["ts"])` arunca pe un fișier valid JSON dar cu un record corupt. Acum record-urile fără `ts` sunt excluse la construirea seriei — toleranță la fel de strictă ca `load_existing_storage`.
- **Badge-ul „Stocare" arăta „ultima captură" când nu exista nicio valoare** (TO_FIX #7): cu `current === null` (fără istoric ȘI fără live), badge-ul afișa „ultima captură" — fals. Acum afișează „se încarcă" în timpul loading-ului și „nicio captură" pentru no-data; „live" doar pentru `source === "live"`.
- **Push-ul workflow-urilor putea pierde un commit la respingere non-fast-forward** (TO_FIX #1): `storage-capture.yml` și `data-refresh.yml` făceau un singur `git push` după rebase — dacă celălalt workflow împingea între rebase și push, captura/ziua se pierdea. Acum push-ul are **retry (3 încercări)**: la respingere reface rebase pe remote și reîncearcă; auto-heal doar după epuizarea încercărilor sau la rebase eșuat.
- **README: ordinea fallback-ului stocării documentată** (TO_FIX #3): live → snapshot live stale din cache → ultima captură (nu doar „fallback la ultima captură").

### Documentat

- **Cele 2 teste union-type din `tests/local-preference.test.ts`** (TO_FIX #2): adăugate la fix-ul de tipuri `readLocalPreference` (între 0.3.4 și 0.3.5), nu erau menționate în nicio intrare. Intrarea 0.3.5 e corectată: 101 (0.3.4) + 2 union-type + 12 storage = **115**, iar 0.3.6 a adăugat 14 → **129** (totalul real verificat).
- **Tabelul din `docs/05-ui-dashboard.md` reparat** (TO_FIX #4): rândul `Header` conținea conținutul lui `Filters` înghesuit pe aceeași linie (7 celule într-un tabel cu 3 coloane) — împărțit în două rânduri complete.

### Adăugat

- **1 test unitar nou** (total: **130**): `extractIspoz` reject gol/whitespace/null/array + hex/binary/underscore (valori valide rămân acceptate, inclusiv exponent `1e3`). Asserts noi în teste existente: `current.ts === Date.parse(current.t)` la snapshot-ul live (`storage.test.ts`), `merge_storage` tolerant la record fără `ts` + `ts == epoch(t)` end-to-end (`capture-storage.test.ts`).

## [0.3.6] — 2026-08-09, 19:40 EEST

### Reparat

- **Workflow-urile de date puteau pierde un commit la push respins** (review MyRabbit P3-001): `storage-capture.yml` (cron orar) și `data-refresh.yml` (cron zilnic) făceau `git commit` + `git push` fără un `git pull` înainte — dacă cele două rulează în paralel pe aceeași ramură (ex: 03:00 și 03:30 UTC), push-ul e respins ca non-fast-forward și captura orei/ziua se pierdea. Acum ambele fac `git pull --rebase --autostash` înainte de commit+push; la eșec de rebase amână actualizarea (auto-heal la rularea următoare), nu riscă un push respins.
- **Badge-ul „Stocare" eticheta greșit un snapshot live stale ca „ultima captură"** (P3-002): când fetch-ul la `/sen-filter` eșua și TTL-ul expirase, `getStorageData` întorcea snapshot-ul din cache cu `fetchedAt: 0` → UI-ul îl prezenta ca „ultima captură", deși era o valoare live veche. Acum `current.source` e **proveniența** valorii: `"live"` (snapshot de la `/sen-filter`, proaspăt sau stale, cu `fetchedAt`-ul original > 0) vs `"capture"` (punct din istoric, `fetchedAt: 0`); funcția pură `pickMostRecent` alege cea mai recentă valoare cunoscută.
- **Captura în aceeași secundă cu valoare schimbată se pierdea** (P3-003, logica din `scripts/convert-sen.py`): dedupe-ul pe `t` (secundă) compara doar cheia, nu valoarea — o rulare în aceeași secundă cu ISPOZ diferit era tratată ca „deja la zi" și update-ul era aruncat. `merge_storage` compară acum și valoarea: aceeași secundă + valoare diferită → suprascrie.
- **Logica Python de captură nu avea niciun test automat** (P2-001): dedupe, parse JSON, reject negative/NaN și sortarea erau netestate (repo-ul testează doar TS). Acum `extract_ispoz`/`merge_storage`/`load_existing_storage` sunt funcții pure, iar `tests/capture-storage.test.ts` le rulează real (import + flux end-to-end cu mock server HTTP și fișiere temporare prin `SEN_STORAGE_URL`/`SEN_STORAGE_OUT` — datele reale din `data/` nu sunt atinse). `extract_ispoz` respinge și **NaN/Inf** (un check doar pe `< 0` le-ar fi lăsat să treacă).
- **Culoarea stocării era hardcodată în componentă** (P3-004): `#A582FF` stătea în `storage-card.tsx`, încălcând regula AGENTS §4.5 (hex-urile doar în `constants.ts`). Mutată în `STORAGE_COLOR` din `constants.ts`, importată în card.

### Adăugat

- **14 teste unitare noi** (total: **129**): `tests/capture-storage.test.ts` — 9 teste pentru logica Python de captură (extract_ispoz: numeric/lipsă/non-numeric/negativ/NaN/Inf/non-list; merge_storage: punct nou + sortare, dedupe aceeași secundă, suprascriere la valoare diferită, curățare duplicate vechi; end-to-end: scriere corectă, payload invalid/ISPOZ lipsă → neatinse, eșec de rețea → grațios, fișier corupt/non-list → restart curat) + 5 teste noi în `tests/storage.test.ts` (`source` corect pe live/capture, `pickMostRecent` pe cele 3 cazuri).

## [0.3.5] — 2026-08-09, 18:24 EEST

### Adăugat

- **Stocare (ISPOZ — „Instalații de stocare")**: Transelectrica expune stocarea doar ca snapshot curent (`/sen-filter`), fără istoric. Construim noi seria:
  - **Captură orară** — modul `--capture-storage` în `scripts/convert-sen.py` (fetch `/sen-filter`, extrage `ISPOZ`, append cu **dedupe pe `t`** — fișiere cu duplicate vechi sunt curățate, rulări în aceeași secundă nu creează duplicate) → `data/sen-storage.json`; workflow nou `.github/workflows/storage-capture.yml` (cron orar `0 * * * *`, commit doar la schimbare).
  - **Runtime** — `src/lib/sen/storage.ts` (server-only): încarcă seria acumulată (cache singleton) + fetch snapshot live cu TTL 10 min, fallback la ultima captură și backoff 1 min la eșec; endpoint nou `GET /api/sen/storage` (`src/app/api/sen/storage/route.ts`).
  - **UI** — `StorageCard` (`src/components/dashboard/storage-card.tsx`) în sidebar, lângă „Mixul curent": valoare curentă (MW), trend față de ultima captură (încărcare/descărcare/stabil), sparkline SVG cu seria acumulată; hook `useStorageData` (`src/hooks/use-storage-data.ts`). Culoare accent = violetul oficial ISPOZ (`#A582FF`).
- **Tipuri noi** în `types.ts`: `StoragePoint` + `StorageApiResponse`.
- **14 teste unitare noi** (total: **115**): 12 în `tests/storage.test.ts` (`extractIspoz` (payload valid/lipsă/invalid/non-array), `loadStorageHistory` (serie reală, sortată), `fetchCurrentIspoz` (fetch mock-uit: succes, HTTP non-OK, fără ISPOZ), `getStorageData` (snapshot live + istoric, cache TTL → un singur fetch la apeluri repetate, fallback la ultima captură fără throw, backoff după eșec)) + **2 în `tests/local-preference.test.ts`** (acoperirea union-type a lui `readLocalPreference`: fără validator → `string` brut; cu type predicate → `T` confirmat — adăugate la fix-ul de tipuri aplicat între 0.3.4 și 0.3.5). Matematica: 101 (0.3.4) + 2 + 12 = **115**.
- **Docs + README + CHANGELOG**: documentate captura orară, endpoint-ul `/api/sen/storage`, modulul `storage.ts`, cardul UI, workflow-ul nou; manifest `docs/.docs-manifest.json` extins cu fișierele noi.

## [0.3.4] — 2026-08-09, 17:23 EEST

### Adăugat

- **Preferințele de filtrare persistă în localStorage**: hook nou `useLocalPreference` (`src/hooks/use-local-preference.ts`, bazat pe `useSyncExternalStore` — fără hydration mismatch) salvează preset-ul de interval și granularitatea; revin la ele la refresh, nu la valori implicite. Logica de citire/scriere e în funcții pure `src/lib/local-preference.ts` (storage injectat, protecție la excepții, validare la citire) — testate fără DOM.
- **`GRANULARITIES` + `granularitiesForPreset`** (`src/lib/sen/types.ts`): sursă unică pentru lista de granularități și pentru regula de compatibilitate preset→granularitate (24h fără `day`; 30d/all fără `raw`/`10m`; restul = toate). Mutat din `filters.tsx` (unde era duplicat) ca logica pură să fie testabilă fără import de component client.
- **11 teste unitare noi** (`tests/local-preference.test.ts`): `readLocalPreference`/`writeLocalPreference` (fallback la `null`/excepție/`isValid` eșuat, string brut fără JSON, succes/eșec fără throw) + `granularitiesForPreset` (24h, 30d, all, preset-uri libere). Total: **101 teste unitare**.

### Reparat

- **🔴 Fundal alb pe dark mode (Tailwind v4)**: clasele custom `bg-aura-*` erau definite în `@layer utilities`, unde variantele (`dark:`) **nu se generează** în Tailwind v4 — pe dark mode rămânea activ doar fundalul light (alb). Mutate în directiva `@utility` și verificat în CSS-ul compilat că `.dark\:bg-aura-dark:is(.dark *)` se generează corect (charcoal adânc).
- **Fundal „control room" profesional**: înlocuite radial-gradients-urile (pete circulare vizibile, aspect amator) cu un `linear-gradient` vertical cu contrast foarte mic (adâncime subtilă „lumină de sus") + granulație fină grayscale anti-banding.
- **Perechea preset/granularitate incompatibilă stocată în localStorage** (ex: `24h`+`day` salvată înainte de protecție) ajungea în query-ul de date: acum e normalizată la citire (`effectiveGranularity` în `page.tsx`, folosită pentru query, grafice și UI), iar dropdown-ul de granularitate **dezactivează** opțiunile incompatibile cu preset-ul activ.
- **`.gitignore`**: pattern-ul `local-*` ignora accidental fișiere reale de cod (`src/lib/local-preference.ts`, `tests/local-preference.test.ts`) — adăugate excepții explicite; fără ele commit-ul ar fi rupt app-ul (importul lanțului de preferințe) și ar fi pierdut testele.
- **Documentație**: AGENTS.md §4.10 + docs/07 — pornirea serverului cere **întotdeauna** aprobare explicită (fără excepție activ/inactiv); probele curl clasifică exit status (`7` = refuz/port liber vs `28` = timeout/stare necunoscută); curățarea folosește fișiere metadata unice per rulare + **verificarea identității PID** înainte de `kill` (nu ucide niciodată un proces străin/reutilizat). Docs 05/06/07/08 + manifest aduse la zi cu codul (tabele corectate, regula de teste clarificată: „contează acoperirea, nu directorul fizic").

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
