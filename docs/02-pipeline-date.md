# 02 — Pipeline-ul de date

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [04-strat-date.md](./04-strat-date.md) · [03-api.md](./03-api.md)

## Privire de ansamblu

```
upload/Grafic_SEN.xlsx   ← sursă istorică Transelectrica (rebuild complet)
        │
        │  bun run data:convert  (= python3 scripts/convert-sen.py)
        ▼
data/sen-data.json       ← 5.606 înregistrări tipizate, sortate crescător după ts
data/sen-summary.json    ← statistici globale precalculate (KPI instant)
        ▲
        │  bun run data:refresh  (= python3 scripts/convert-sen.py --fetch)
endpoint live Transelectrica (transelectrica.ro/widget/web/tel/sen-grafic)
        │
        ▼
src/lib/sen/loader.ts    ← cache singleton, server-only (node:fs)
src/lib/sen/live.ts      ← fetch live Transelectrica (server-only, TTL 10 min + fallback)
        │
        ▼
API routes (/api/sen, /api/sen/summary, /api/sen/export)
```

## 1. Sursele datelor

### 1a. Istoric: `upload/Grafic_SEN.xlsx` (modul implicit)

- Foaia „Grafic SEN", header cu 12 coloane: `Data`, `Consum[MW]`, `Medie Consum[MW]`, `Productie[MW]`, `Carbune[MW]`, `Hidrocarburi[MW]`, `Ape[MW]`, `Nuclear[MW]`, `Eolian[MW]`, `Foto[MW]`, `Biomasa[MW]`, `Sold[MW]`.
- Interval inițial: **01.07.2026 → 08.08.2026**, înregistrări la ~10 minute.
- Format timp în sursă: `DD-MM-YYYY HH:MM:SS` (wall-clock, ora României).
- Fișierul se înlocuiește manual doar pentru un rebuild complet.

### 1b. Live: endpoint-ul public Transelectrica (`--fetch` / runtime)

- **Endpoint public** (fără API key), folosit de widget-ul „SEN Grafic" de pe transelectrica.ro:
  `https://www.transelectrica.ro/widget/web/tel/sen-grafic?p_p_id=SENGrafic_WAR_SENGraficportlet&p_p_lifecycle=2&p_p_state=maximized&p_p_mode=view` + parametri `_SENGrafic_WAR_SENGraficportlet_start_*` / `_SENGrafic_WAR_SENGraficportlet_end_*` (`day`/`month`/`year`/`Hour`/`Minute`).
- Răspuns: text `text/plain` — rânduri separate prin `|`, câmpuri prin `;`: `09-08-2026 00:09:47;5435;5282;6354;-918;778;1267;1113;680;2435;-14;60;` (timp + 11 câmpuri).
- ⚠️ **Ordinea coloanelor DIFERĂ de xlsx**: endpoint-ul live pune `Sold` pe **poziția a 4-a** (imediat după `Productie`), apoi `Carbune…Biomasa`; xlsx-ul are `Sold` pe **ultima** poziție. Verificat pe payload live vs. xlsx la același ts (18:07:57: live `…;-407;657;1101;849;678;2263;726;57` = xlsx `Sold −407, Carbune 657, …`). Implementare: `LIVE_FIELDS` în `convert-sen.py` + `FIELD_ORDER` în `live.ts`.
- Cu `_SENGrafic_WAR_SENGraficportlet_excel=true` întoarce un `.xlsx` real (același „Genereaza Excel" de pe site).
- Se actualizează la **~10 minute**. ⚠️ Interogările pe **>2 luni pot dura 30+ secunde** — de aceea fetch-ul e mereu **incremental** (doar de la ultimul `ts` cunoscut, cu overlap).

## 2. Convertorul: `scripts/convert-sen.py`

Două moduri, funcții de parsare/summary partajate (dar **ordine de coloane diferite** — vezi §1b):

1. **`bun run data:convert`** (implicit) — citește `upload/Grafic_SEN.xlsx` cu `openpyxl` (import lazy: modul `--fetch` e stdlib-only, fără openpyxl). Coloanele sunt mapate cu `FIELDS` (ordinea xlsx: `Sold` ultimul).
2. **`bun run data:refresh`** (`--fetch`) — descarcă **incremental** de la endpoint-ul live: pornește de la ultimul `ts` din `sen-data.json` (minus 2h overlap), merge cu dedupe pe `ts`, sortează și regenerează ambele fișiere. Coloanele sunt mapate cu `LIVE_FIELDS` (ordinea live: `Sold` pe poziția 4). Dacă nu sunt date noi, nu rescrie nimic; la eșec de rețea întoarce date goale (nu crapă); un sanity-check oprește actualizarea dacă „solarul produce noaptea" (semn de shift de coloane).

Pașii comuni:

1. Parsează fiecare rând: timp `DD-MM-YYYY HH:MM:SS` → ISO `YYYY-MM-DDTHH:MM:SS.000Z` + `ts` epoch ms.
2. Normalizează valorile: elimină markerii de estimare (`6945*` → `6945`), trim-uit stringuri.
3. Sare rândurile invalide (timp neparsabil, valori lipsă).
4. **Sortează crescător după `ts`**.
5. Scrie `data/sen-data.json` (compact) și `data/sen-summary.json` (indentat, `ensure_ascii=False`).

> **Automatizare**: workflow-ul [`.github/workflows/data-refresh.yml`](../.github/workflows/data-refresh.yml) rulează zilnic `bun run data:refresh` (cron `30 3 * * *` UTC = 06:30 ora României vara) și face commit — istoricul crește singur, iar Vercel (Git integration) redeploy-ează automat. După fetch, un pas verifică **prospețimea** datelor (prag ~40h, calibrat pe contractul fake-UTC: endTs e cu ~2-3h „înaintea" UTC-ului real; o zi pierdută dă ~21h la ora cronului, max ~36.5h chiar la un run manual seara) și eșuează vizibil doar la eșecuri **repetate** (două+ zile consecutiv ≈ min 45h) — un eșec tranzitoriu nu produce alarmă falsă.

> **Nu modifica manual `data/*.json`.** Dacă „repari" datele „ca să iasă testele", ai greșit — repară scriptul sau logica, nu datele. Dacă schimbi structura output-ului, actualizează și tipurile din [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) și testele.

> **Contractul de timp (important)**: valorile sursă sunt **wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO** (sufix `.000Z`), iar `ts` e epoch-ul corespunzător. Nu „conversionezi” fusurile orare — cifrele din sursă trebuie să apară identic în UI. **Implementare**: toate funcțiile de afișare (`format.ts`) și de agregare (`bucketKey` din `aggregate.ts`) folosesc **getters/constructori UTC** (`getUTCHours`, `Date.UTC`, `timeZone: "UTC"`), ca rezultatul să fie identic pe orice fus orar (server sau browser). **Nu înlocui cu getters locale** — pe un sistem EEST, `18:07` din sursă ar deveni `21:07` în UI.

## 3. Output: `data/sen-data.json`

Array de obiecte (schema exactă):

```json
{
  "t": "2026-07-01T18:11:06.000Z",
  "ts": 1782929466000,
  "consum": 7210.0,
  "medieConsum": 7318.0,
  "productie": 5309.0,
  "carbune": 815.0,
  "hidrocarburi": 715.0,
  "ape": 1769.0,
  "nuclear": 679.0,
  "eolian": 402.0,
  "foto": 887.0,
  "biomasa": 38.0,
  "sold": 1900.0
}
```

Toate valorile numerice sunt în **MW**. Semantica `sold` (confirmată pe sursa oficială, `SOLD = CONS − PROD`): **pozitiv = import** (consum peste producție), **negativ = export** (excedent).

## 4. Output: `data/sen-summary.json`

Statistici globale precalculate pentru KPI-uri instant:

- `count`, `start`/`end`, `startTs`/`endTs`
- `latest` — cea mai recentă înregistrare completă
- `stats` — `min`/`max`/`avg` pentru fiecare câmp numeric
- `sources` — lista surselor
- `renewableShareAvg` — ponderea regenerabilă medie (%)
- `balance` — `importSamples`, `exportSamples`, `importShare`, `avgImport`, `avgExport`, `netAvg`. Semnul: `avgImport` e **pozitiv** (media soldurilor > 0), `avgExport` e **negativ** (media soldurilor < 0) — semantica `SOLD = CONS − PROD` (pozitiv = import, negativ = export).

Structura corespunde tipului [`SenSummaryResponse`](../src/lib/sen/types.ts).

## 5. Loader: `src/lib/sen/loader.ts`

- Citește JSON-urile cu `node:fs` și le ține în memorie (cache singleton pe viața procesului).
- `loadReadings()` → array sortat; `loadSummary()` → obiectul summary.
- `getCachedReadings()` → sincron, `null` dacă nu sunt încă încărcate (util în teste).
- `resetCache()` → invalidează cache-ul (folosit în teste).
- **Server-only**: conține `node:fs` — **nu** îl importa în componente client. Documentat în [AGENTS.md](../AGENTS.md).

## 6. Date live la runtime: `src/lib/sen/live.ts`

- `parseLiveLine` / `parseLivePayload` — parsează textul de la endpoint (funcții pure, testate).
- `mergeReadings(static, live)` — dedupe pe `ts` (live câștigă), sortat crescător (pură).
- `bucharestOffsetMs(date)` — offset-ul EET/EEST (+2h/+3h) după regulile UE, pentru capătul „end" al interogării (pură).
- `fetchLiveReadings(fromTs, toTs)` — fetch cu `AbortSignal.timeout(5s)`; `buildLiveUrl` construiește query-ul. **Guard anti-shift**: `hasSuspiciousNightSolar` respinge payload-urile cu `foto > 50 MW` între 00-06h (solarul nu produce noaptea — fereastra acoperă noaptea fizică de vară: primul `foto > 50` real e la 06:13), ca un payload corupt să nu suprascrie rândurile statice bune prin dedupe.
- `getLiveReadings()` — date statice + live cu **cache TTL 10 min**; **fallback silențios la statice** dacă fetch-ul eșuează, cu **backoff 1 min** (un eșec de rețea nu întârzie fiecare request cu timeout-ul — dashboard-ul nu se rupe niciodată). Folosește o **promisiune în zbor partajată** (`inflightFetch`) ca mai multe requesturi concurente să nu dubleze fetch-ul.
- `getLiveSummary()` — summary-ul precalculat cu `latest`/`end`/`endTs`/`count` actualizate dacă live-ul a adus puncte mai noi.
- **Server-only** (folosește `fetch` server-side) — nu importa în componente client.

## Cum regenerezi datele

```bash
bun run data:convert      # rebuild complet din xlsx
bun run data:refresh      # fetch incremental live (adaugă datele noi)
# apoi repornește serverul (loader-ul are cache singleton)
```

## Testare

Pipeline-ul complet nu e testat unitar (depinde de fișiere); logica de agregare/statistici/parsare live **da** — vezi [07-testing-ci.md](./07-testing-ci.md).
