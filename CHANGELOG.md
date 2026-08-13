# Changelog

Toate modificările notabile ale proiectului sunt documentate în acest fișier.

Formatul respectă [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), iar versiunile respectă [Semantic Versioning](https://semver.org/lang/ro/).

Timestamp-urile sunt în **ora României** (EEST, UTC+3 — vara; EET, UTC+2 — iarna).

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
