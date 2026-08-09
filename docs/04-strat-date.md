# 04 — Stratul de date (`src/lib/sen/`)

> Vezi și: [02-pipeline-date.md](./02-pipeline-date.md) · [03-api.md](./03-api.md) · [07-testing-ci.md](./07-testing-ci.md)

Acesta e **inima logicii proiectului**: funcții pure, tipizate, deterministe, acoperite de teste unitare. Importă logica printr-un singur barrel: `@/lib/sen` (adică [`index.ts`](../src/lib/sen/index.ts)) — **client-safe** (fără `node:fs`). `loader.ts` și `live.ts` sunt server-only și se importă **direct**, doar din API routes.

## Fișiere

| Fișier                                        | Conținut                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`types.ts`](../src/lib/sen/types.ts)         | Tipuri TypeScript: `SenReading`, `SenField`, `SourceField`, `Granularity`, `AggregatedPoint`, `FieldStats`, `SenApiResponse`, `SenSummaryResponse` |
| [`constants.ts`](../src/lib/sen/constants.ts) | Metadate surse: etichete RO, culori semantice, ordine de afișare, clasificare fosil/regenerabil                                                    |
| [`aggregate.ts`](../src/lib/sen/aggregate.ts) | `mean`, `bucketKey`, `aggregate`, `filterByRange`, `downsample`                                                                                    |
| [`stats.ts`](../src/lib/sen/stats.ts)         | `fieldStats`, `renewableShare`, `sourceShares`, `balanceStats`, `latestReading`                                                                    |
| [`format.ts`](../src/lib/sen/format.ts)       | Formatare `Intl` ro-RO: numere, MW, sold, procente, date, ore                                                                                      |
| [`loader.ts`](../src/lib/sen/loader.ts)       | Citire `data/*.json` — **server-only**, cache singleton (excepția de la „pur")                                                                     |
| [`live.ts`](../src/lib/sen/live.ts)           | Date live Transelectrica — **server-only**: parse/merge pure + fetch cu TTL 10 min + fallback static                                               |

## `types.ts` — tipurile cheie

- **`SenReading`** — o înregistrare brută: `t` (ISO), `ts` (epoch ms), 11 câmpuri numerice în MW (`consum`, `medieConsum`, `productie`, `carbune`, `hidrocarburi`, `ape`, `nuclear`, `eolian`, `foto`, `biomasa`, `sold`).
- **`SourceField`** — `carbune | hidrocarburi | ape | nuclear | eolian | foto | biomasa` (ordinea din `SOURCE_FIELDS`).
- **`Granularity`** — `"raw" | "10m" | "hour" | "day"`. Nu adăuga altele fără să actualizezi `bucketKey`, API-ul și UI-ul.
- **`AggregatedPoint`** — un bucket agregat: `t`, `ts`, toate câmpurile numerice (medii pe bucket) + `count`.
- **`SenSummaryResponse`** — structura `data/sen-summary.json` + răspunsul `/api/sen/summary`.

## `constants.ts` — sursa unică de adevăr pentru surse

- **`SOURCES`** — `Record<SourceField, SourceMeta>` cu `label` (RO), `full`, `color` (hex), `fill` (rgba), `kind` (`fossil`/`renewable`), `hint`.
- **`SOURCE_ORDER`** — ordinea de afișare pentru stacked area: `[carbune, hidrocarburi, nuclear, ape, biomasa, eolian, foto]` (fosilele jos, nuclearul imediat după fosile, apoi regenerabilele spre sus). **Este o ordine intenționată** — nu o reordona „ca să fie mai frumoasă".
- **`RENEWABLE_FIELDS`** = `[ape, eolian, foto, biomasa]`; **`FOSSIL_FIELDS`** = `[carbune, hidrocarburi]`. **Nuclearul NU e regenerabil** (e low-carbon) și e exclus intenționat din calculul share-ului regenerabil — `SOURCES.nuclear.kind = "lowcarbon"`; vezi [06-design.md](./06-design.md).
- **`SERIES_COLORS`** — culori pentru serii non-sursă (`consum` roșu, `productie` emerald, `medieConsum` violet, `soldPositive` roșu = import, `soldNegative` verde = export).
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
- `formatRelative(iso, now?)` → `"acum 10 min"`, `"acum 2 ore"`.
- `formatLastUpdatedLabel(relative)` → eticheta de accesibilitate a badge-ului „ultima înregistrare" din Header: `"Ultima înregistrare, actualizată …"` (acord feminin).
- `granularityLabel(g)` → eticheta RO a unei granularități.

> **Important**: datele sursă sunt etichetate cu anul 2026 — le afișăm **fidel**, nu „corectăm” anul. **Valorile sursă sunt wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO.** Funcțiile de formatare (`formatDateTime`, `formatDate`, `formatTime`) folosesc **getters UTC** (`getUTCHours`, `timeZone: "UTC"`) — nu înlocui cu getters locale, ar schimba ora afișată pe sisteme non-UTC.

## `loader.ts` — citire date (server-only)

- `loadReadings()` / `loadSummary()` — cache singleton (un singur `readFile` per proces).
- `getCachedReadings()` — sincron, `null` dacă nu e încărcat.
- `resetCache()` — pentru teste.
- ⚠️ **Doar server** (folosește `node:fs` + `process.cwd()`). Nu importa în componente client — vezi [AGENTS.md](../AGENTS.md).

## Cum testezi

- Testele sunt în `tests/sen/*.test.ts` și acoperă `aggregate`, `stats`, `format`, `live` (90 teste).
- După modificări în aceste fișiere, rulează `bun test` + `bun run typecheck`.
- Dacă ai modificat codul (sau documentația), actualizează documentele acoperite de modificare și rulează `bun run docs:mark-verified` ca să le marchezi ca fiind la zi.
- Verificarea finală: `bun run check` întreg (format → docs → lint → typecheck → teste → build).
