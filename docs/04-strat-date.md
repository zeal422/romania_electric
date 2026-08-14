# 04 — Stratul de date (`src/lib/sen/`)

> Vezi și: [02-pipeline-date.md](./02-pipeline-date.md) · [03-api.md](./03-api.md) · [07-testing-ci.md](./07-testing-ci.md)

Acesta e **inima logicii proiectului**: funcții pure, tipizate, deterministe, acoperite de teste unitare. Importă logica printr-un singur barrel: `@/lib/sen` (adică [`index.ts`](../src/lib/sen/index.ts)) — **client-safe** (fără `node:fs`). `loader.ts`, `live.ts`, `storage.ts` și `instant.ts` sunt server-only și se importă **direct**, doar din API routes.

## Fișiere

| Fișier                                        | Conținut                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`types.ts`](../src/lib/sen/types.ts)         | Tipuri TypeScript: `SenReading`, `SenField`, `SourceField`, `Granularity`, `AggregatedPoint`, `FieldStats`, `SenApiResponse`, `SenSummaryResponse`, `StoragePoint`, `StorageApiResponse` |
| [`constants.ts`](../src/lib/sen/constants.ts) | Metadate surse: etichete RO, culori semantice, ordine de afișare, clasificare fosil/regenerabil + `STORAGE_COLOR` (accentul stocării ISPOZ)                                              |
| [`aggregate.ts`](../src/lib/sen/aggregate.ts) | `mean`, `bucketKey`, `aggregate`, `filterByRange`, `downsample`, `parseRange`                                                                                                            |
| [`stats.ts`](../src/lib/sen/stats.ts)         | `fieldStats`, `renewableShare`, `sourceShares`, `balanceStats`, `latestReading`                                                                                                          |
| [`format.ts`](../src/lib/sen/format.ts)       | Formatare `Intl` ro-RO: numere, MW, sold, procente, date, ore                                                                                                                            |
| [`loader.ts`](../src/lib/sen/loader.ts)       | Citire `data/*.json` — **server-only**, cache singleton (excepția de la „pur")                                                                                                           |
| [`live.ts`](../src/lib/sen/live.ts)           | Date live Transelectrica — **server-only**: parse/merge pure + fetch cu TTL 10 min + fallback la `liveCache` stale (max 24h) și date statice                                             |
| [`storage.ts`](../src/lib/sen/storage.ts)     | Stocare (ISPOZ) — **server-only**: serie acumulată (cache singleton) + snapshot live `/sen-filter` cu TTL 3 min + fallback la ultima captură                                             |
| [`instant.ts`](../src/lib/sen/instant.ts)     | Valori real-time (`/sen-filter`) — **server-only**: parser pur + fetch cu TTL 10s + backoff 30s + guard prospețime; la eșec → `null` (UI cade pe `summary.latest`)                       |

## `types.ts` — tipurile cheie

- **`SenReading`** — o înregistrare brută: `t` (ISO), `ts` (epoch ms), 11 câmpuri numerice în MW (`consum`, `medieConsum`, `productie`, `carbune`, `hidrocarburi`, `ape`, `nuclear`, `eolian`, `foto`, `biomasa`, `sold`).
- **`SourceField`** — `carbune | hidrocarburi | ape | nuclear | eolian | foto | biomasa` (ordinea din `SOURCE_FIELDS`).
- **`Granularity`** — `"raw" | "10m" | "hour" | "day"`. Nu adăuga altele fără să actualizezi `bucketKey`, API-ul și UI-ul.
- **`AggregatedPoint`** — un bucket agregat: `t`, `ts`, toate câmpurile numerice (medii pe bucket) + `count`.
- **`SenSummaryResponse`** — structura `data/sen-summary.json` + răspunsul `/api/sen/summary`.
- **`InstantData`** — snapshot-ul real-time (`/sen-filter`): `t`, `ts` + 10 câmpuri numerice cu aceleași nume ca `SenReading` (`consum`, `productie`, `sold`, sursele) — granularitate de secunde, NU din seria istorică.

## `constants.ts` — sursa unică de adevăr pentru surse

- **`SOURCES`** — `Record<SourceField, SourceMeta>` cu `label` (RO), `full`, `color` (hex), `fill` (rgba), `kind` (`fossil`/`renewable`), `hint`.
- **`SOURCE_ORDER`** — ordinea de afișare pentru stacked area: `[carbune, hidrocarburi, nuclear, ape, biomasa, eolian, foto]` (fosilele jos, nuclearul imediat după fosile, apoi regenerabilele spre sus). **Este o ordine intenționată** — nu o reordona „ca să fie mai frumoasă".
- **`RENEWABLE_FIELDS`** = `[ape, eolian, foto, biomasa]`; **`FOSSIL_FIELDS`** = `[carbune, hidrocarburi]`. **Nuclearul NU e regenerabil** (e low-carbon) și e exclus intenționat din calculul share-ului regenerabil — `SOURCES.nuclear.kind = "lowcarbon"`; vezi [06-design.md](./06-design.md).
- **`SERIES_COLORS`** — culori pentru serii non-sursă (`consum` roșu, `productie` emerald, `medieConsum` violet, `soldPositive` roșu = import, `soldNegative` verde = export).
- **`STORAGE_COLOR`** — accentul pentru stocare (ISPOZ, violetul oficial `#A582FF`). Nu e sursă de producție, deci stă separat de `SOURCES` — dar aceeași regulă: importat în componente, nu hardcodat (AGENTS §4.5).
- **`READING_META`** — etichete + unități pentru toate câmpurile de citire.

> **Regulă**: culorile și etichetele surselor se schimbă **doar aici**. Nu hardcoda hex-uri în componente. Vezi [06-design.md](./06-design.md) pentru detaliul culorilor.

## `aggregate.ts` — agregare pe bucket-uri de timp

- **`mean(values)`** — medie aritmetică, ignoră NaN/Infinity, `[]` → 0.
- **`bucketKey(ts, granularity)`** — cheia de bucket (începutul perioadei), **calculată cu `Date.UTC`** (contract de timp):
  - `raw`/`10m` → aliniat la minut multiplu de 10
  - `hour` → începutul orei
  - `day` → miezul nopții (00:00 UTC)
- **`aggregate(readings, granularity)`** — grupează, calculează **media** fiecărui câmp numeric per bucket, rotunjește la 1 zecimală (`r1`), sortează crescător. La `raw` întoarce fiecare înregistrare ca punct (cu `count: 1`).
- **`filterByRange(readings, from?, to?)`** — filtrează inclusiv pe `ts`; capete `undefined` = nu filtrează.
- **`downsample(items, maxPoints)`** — sub-eșantionare uniformă (păstrează primul și ultimul element).
- **`buildLegendRows(latest?)`** (`constants.ts`) — derivă toate cele 7 surse din `SOURCE_ORDER` cu `label`/`color`/`hint` din `SOURCES` + `value` și `isZero` (`value <= 0`). Niciodată filtrat: sursele la 0 rămân în legendă cu zero-state (folosită de `SourceDistribution`). Pură, testabilă fără RTL.
- **`parseRange(v, fallback?)`** — convertește parametrul `from`/`to` din query string în număr finit; input invalid, `NaN`, gol, **whitespace-only** (`Number(" ") === 0`) sau literaluri **hex/octal/binary** (`0x10`, `0b101` — pe care `Number()` le-ar accepta: 16, 5) sau **underscore** (`1_000` — pe care `Number()` îl respinge oricum, dând `NaN`) → fallback (sanitizarea rutelor API/export). Regex zecimal identic cu `extractIspoz`/`float()` din Python (paritate): doar zecimale + exponent (`1e3`) sunt valide.

Toate sunt **pure și deterministe** — ideal pentru teste (vezi [07-testing-ci.md](./07-testing-ci.md)).

## `stats.ts` — statistici

- **`fieldStats(values)`** → `{min, max, avg}`, rotunjite la 1 zecimală; `[]` → toate 0.
- **`renewableShare(readings)`** → ponderea regenerabilă ca procent (0–100), media ponderată pe probe (suma `RENEWABLE_FIELDS` / `productie`).
- **`sourceShares(readings)`** → procentul fiecărei surse din producția totală medie.
- **`balanceStats(soldValues)`** → `{importSamples, exportSamples, importShare, avgImport, avgExport, netAvg}` (split pe `> 0` import / `< 0` export — semantica oficială `SOLD = CONS − PROD`).
- **`latestReading(readings)`** → înregistrarea cu `ts` maxim (inputul poate fi nesortat).

## `format.ts` — formatare ro-RO (`Intl`)

- `formatNumber(v, decimals?)` — separator de mii cu spațiu, zecimal cu virgulă; non-finit → `—`.
- `formatMW(v)` → `"5 932 MW"`.
- `formatSigned(v)` — semn explicit `+`/`−`.
- `formatSold(v)` → `{text, label: Import|Export|Echilibru, sign}` (pozitiv = Import, negativ = Export).
- `formatPercent(v, decimals?)`, `mwToGwh(mw, hours)`.
- `formatDateTime(iso, {withYear?})` → `"8 aug, 18:07"`; `formatDate` → `"8 aug 2026"`; `formatTime` → `"18:07"`.
- `formatAxisTick(ts, granularity)` → label de axă X pentru grafice (UTC): `"8 aug"` la `day`/`hour`, `"18:07"` la `raw`/`10m` — sursa unică pentru axele Recharts (folosit de `ProductionMixChart`, `DemandSupplyChart`, `BalanceChart`).
- `dataAgeMs(iso, now)` → vârsta reală în **ms** a unei înregistrări față de `now` (baza de calcul a `formatRelative` și pragul de prospețime din UI); rezolvă instanța UTC reală a etichetei fake-UTC prin candidați `−2h`/`−3h` self-consistenți (`bucharestOffsetMs(candidat) === offset aplicat`), alegând cel mai recent candidat valid ≤ `now` — corect și la tranzițiile DST. `now` e obligatoriu (puritate §4.2).
- `formatRelative(iso, now)` → `"acum 10 min"`, `"acum 2 ore"` — construit pe `dataAgeMs` (aceeași rezolvare a instanței reale); `now` e obligatoriu (fără default `Date.now()`, puritate §4.2) — corect și la tranzițiile DST (fix 0.3.19, refactor 0.3.22).
- `formatLastUpdatedLabel(relative)` → eticheta de accesibilitate a badge-ului „ultima înregistrare" din Header: `"Ultima înregistrare, actualizată …"` (acord feminin).
- `granularityLabel(g)` → eticheta RO a unei granularități.

> **Important**: datele sursă sunt etichetate cu anul 2026 — le afișăm **fidel**, nu „corectăm” anul. **Valorile sursă sunt wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO.** Funcțiile de formatare (`formatDateTime`, `formatDate`, `formatTime`) folosesc **getters UTC** (`getUTCHours`, `timeZone: "UTC"`) — nu înlocui cu getters locale, ar schimba ora afișată pe sisteme non-UTC.

## `storage.ts` — stocare (ISPOZ, server-only)

- `loadStorageHistory()` — seria acumulată din `data/sen-storage.json` (cache singleton, ordonată cronologic).
- `extractIspoz(payload)` — extrage ISPOZ dintr-un payload `/sen-filter` (listă de `{cod: valoare}`), `null` dacă lipsește/nu e numeric/negativ/non-finit (NaN/Inf) sau e **gol/whitespace/`null`/array/hex-binary-underscore** (reject înainte de `Number()` printr-o regex de zecimale — paritate cu `float()` din Python; fix TO_FIX #8) (pură, testată).
- `fetchCurrentIspoz()` — fetch la `/sen-filter` (timeout 5s); aruncă la eșec (pură de responsabilitate: `getStorageData` face fallback-ul).
- `pickMostRecent(cached, last)` — alege cea mai recentă valoare cunoscută între snapshot-ul live stale (din cache) și ultima captură (pură, testată).
- `getStorageData()` — `{current, history, fetchedAt}`: snapshot live cu **TTL 3 min** (0.3.23: cardul primește polling client 60s, deci valoarea se actualizează la câteva minute) + **backoff 1 min** la eșec, **fallback la cea mai recentă valoare cunoscută** (cache-ul, chiar expirat, înaintea ultimei capturi). `current.source` e **proveniența**: `"live"` (snapshot de la `/sen-filter`, proaspăt sau stale) vs `"capture"` (punct din istoric) — UI-ul etichetează badge-ul după asta, iar un snapshot stale NU mai e prezentat greșit ca „captură". `fetchedAt` păstrează momentul real al valorii live (timestamp-ul original pentru stale), `0` doar pentru punctul din istoric. `t`-ul snapshot-ului respectă contractul de timp (wall-clock RO etichetat UTC, ca live.ts), iar `ts` e **epoch-ul UTC al valorii `t` etichetate** (`Date.parse(t)`) — nu instant-ul real, altfel ar fi cu 2-3h în urmă (fix TO_FIX #6). `loadStorageHistory` e tolerant la fișier lipsă/corupt (serie goală, nu 500). Site-ul nu se rupe dacă Transelectrica e indisponibilă.
- `resetStorageCache()` — invalidare (teste).
- ⚠️ **Doar server** (folosește `node:fs` + `fetch` server-side). Nu importa în componente client.

> **De ce istoricul stocării e „construit de noi"**: Transelectrica expune ISPOZ doar ca snapshot curent, fără istoric. Seria se acumulează orar prin workflow-ul `storage-capture` (vezi [02-pipeline-date.md](./02-pipeline-date.md) §6).

## `instant.ts` — valori real-time (`/sen-filter`, server-only)

- `parseInstantTimestamp(raw)` — `YY/MM/DD HH:MM:SS` → `{t, ts}` (an 2 cifre: 70–99 → 19xx, 0–69 → 20xx; range-uri validate explicit; contract fake-UTC) (pură, testată).
- `parseInstantPayload(payload)` — coduri SEN → câmpuri interne (CONS→consum, PROD→productie, SOLD→sold, CARB→carbune, GAZE→hidrocarburi, APE→ape, NUCL→nuclear, EOLIAN→eolian, FOTO→foto, BMASA→biomasa), validare numerică strictă (paritate cu `float()`) + **invariant anti-shift** `|sold − (consum − productie)| ≤ 5 MW`, timestamp obligatoriu → `InstantData | null` (pură, testată).
- `isInstantFresh(data, now)` — proaspăt dacă vârsta reală (`dataAgeMs`) ≤ `LIVE_STALE_THRESHOLD_MS`; `now` obligatoriu (puritate §4.2) (pură, testată).
- `fetchCurrentInstant()` — fetch la `/sen-filter` (timeout 8s + 1 retry pe eșec tranzitoriu; payload invalid fără retry); aruncă la eșec.
- `getInstantData()` — `InstantData | null`: cache **TTL 10s** + **backoff 30s** + promisiune în zbor partajată + **guard prospețime** (snapshot > 30 min → `null`, ca badge-ul să nu mintă că e „live"). La eșec → `null` — UI-ul cade pe `summary.latest` (site-ul nu se rupe).
- `resetInstantCache()` — invalidare (teste).
- ⚠️ **Doar server** (folosește `fetch` server-side). Nu importa în componente client.

## `loader.ts` — citire date (server-only)

- `loadReadings()` / `loadSummary()` — cache singleton (un singur `readFile` per proces).
- `getCachedReadings()` — sincron, `null` dacă nu e încărcat.
- `resetCache()` — pentru teste.
- ⚠️ **Doar server** (folosește `node:fs` + `process.cwd()`). Nu importa în componente client — vezi [AGENTS.md](../AGENTS.md).

## Cum testezi

- Testele sunt în `tests/sen/*.test.ts` (+ `tests/storage.test.ts` + `tests/capture-storage.test.ts`) și acoperă `aggregate`, `stats`, `format`, `live`, `instant`, `storage` și logica Python de captură (`--capture-storage`).
- După modificări în aceste fișiere, rulează `bun test` + `bun run typecheck`.
- Dacă ai modificat codul (sau documentația), actualizează documentele acoperite de modificare și rulează `bun run docs:mark-verified` ca să le marchezi ca fiind la zi.
- Verificarea finală: `bun run check` întreg (format → docs → lint → typecheck → teste → build).
