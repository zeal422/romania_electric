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

Stocare (ISPOZ) — serie temporală construită de noi:
snapshot /sen-filter (transelectrica.ro/sen-filter, JSON cu coduri SEN)
        │  scripts/convert-sen.py --capture-storage  (workflow storage-capture, cron orar)
        ▼
data/sen-storage.json  ← capturi acumulate [{t, ts, ispoz}]
        │
src/lib/sen/storage.ts ← încarcă seria + fetch snapshot live (TTL 3 min, fallback)
        │
        ▼
API route (/api/sen/storage)

Prețuri PZU (day-ahead) — capturate de noi de la OPCOM (export CSV public):
export CSV OPCOM (opcom.ro/rapoarte-pzu-raportPIP-export-csv/{DD}/{MM}/{YYYY}/en?resolution=60)
        │  scripts/convert-sen.py --capture-prices  (workflow price-capture, cron zilnic)
        ▼
data/sen-prices.json  ← zile cu prețuri orare [{date, prices[24], currency: "EUR"}]
        │
src/lib/sen/prices.ts ← încarcă seria capturată (cache singleton)
src/lib/sen/costs.ts  ← funcții pure: cost = Σ (MWh × preț orar)
        │
        ▼
API route (/api/sen/costs)

Valori real-time (Consum/Producție/Sold + mix pe surse):
snapshot /sen-filter (coduri SEN → valori, același endpoint ca stocarea)
        │  src/lib/sen/instant.ts (server-only, TTL 10s + backoff 30s)
        ▼
API route (/api/sen/instant) → snapshot sau `null` (eșec/stale) ← polling client 30s; fallback-ul pe `summary.latest` îl face UI-ul (nu route-ul)
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

> **Automatizare**: workflow-ul [`.github/workflows/data-refresh.yml`](../.github/workflows/data-refresh.yml) rulează zilnic `bun run data:refresh` (cron `30 3 * * *` UTC = 06:30 ora României vara) și face commit — pasul de fetch **nu** folosește `continue-on-error`: toleranța la un eșec tranzitoriu de rețea e internă în script (`fetch_live` prinde `URLError`/`Exception` și întoarce date goale → exit 0 → „No changes”), iar o eroare reală de script iese non-zero și e vizibilă în Actions (fix TO_FIX F2) — istoricul crește singur, iar Vercel (Git integration) redeploy-ează automat. Înainte de commit face `git pull --rebase --autostash` (poate suprapune cron-ul orar `storage-capture` pe aceeași ramură), iar **push-ul are retry (3 încercări)**: la respingere non-fast-forward (celălalt workflow a împins între rebase și push) reface rebase pe remote și reîncearcă — commit-ul nu se pierde. **Eșecurile REALE ies cu exit non-zero** (rebase eșuat, commit eșuat cu schimbări staged, push epuizat) → workflow-ul e vizibil roșu în Actions pentru monitoring; datele se recuperează oricum la următoarea rulare (cron-ul reface fetch-ul). „Nothing to commit" se consideră doar când nu există schimbări staged (fix TO_FIX #1). După fetch, un pas verifică **prospețimea** datelor (prag ~40h, calibrat pe contractul fake-UTC: endTs e cu ~2-3h „înaintea" UTC-ului real; o zi pierdută dă ~21h la ora cronului, max ~36.5h chiar la un run manual seara) și eșuează vizibil doar la eșecuri **repetate** (două+ zile consecutiv ≈ min 45h) — un eșec tranzitoriu nu produce alarmă falsă.

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

## 6. Stocarea (ISPOZ): `--capture-storage` + `storage.ts`

**Context**: Transelectrica a introdus „Instalații de stocare" (ISPOZ, segment violet `#A582FF` în „SEN Grafic"). Stocarea e expusă **DOAR ca snapshot curent** prin `https://www.transelectrica.ro/sen-filter` (JSON: listă de `{cod: valoare}` cu `ISPOZ` în MW), **fără istoric** — nici în payload-ul live clasic (coloana a 12-a e goală), nici cu `display=ISPOZ`. De aceea **istoricul îl construim noi**, prin capturi periodice.

**Captura** — `python3 scripts/convert-sen.py --capture-storage`:

- Fetch la `/sen-filter`, extrage `ISPOZ` cu `extract_ispoz` (funcție pură: valoare numerică ≥ 0 și finită — respinge și NaN/Inf; payload lipsă/invalid → ignorat silențios, datele existente rămân).
- Append cu `merge_storage` (funcție pură): **dedupe pe `t`** (ISO la nivel de secundă — două rulări în aceeași secundă nu creează duplicate) **+ suprascriere dacă valoarea diferă** (o rulare în aceeași secundă cu ISPOZ schimbat NU e pierdută — fix P3-003); fișiere cu duplicate vechi sau structură non-list sunt curățate, fără crash (fix P2-001). Scrie la **`data/sen-storage.json`**: `[{t, ts, ispoz}]`, sortat cronologic.
- **Automatizare**: workflow-ul [`.github/workflows/storage-capture.yml`](../.github/workflows/storage-capture.yml) — cron **orar** (`0 * * * *`), commit doar dacă fișierul s-a schimbat — pasul de captură **nu** folosește `continue-on-error`: toleranța la un eșec tranzitoriu de rețea e internă în script (`capture_storage` prinde `URLError`/`Exception` și iese cu 0 → „No changes"), iar o eroare reală de script iese non-zero și e vizibilă în Actions (fix TO_FIX F2). Înainte de commit face `git pull --rebase --autostash` (cron-ul orar poate suprapune `data-refresh` pe aceeași ramură), iar **push-ul are retry (3 încercări)** ca la data-refresh; **eșecurile reale ies non-zero** (vizibile în Actions). Spre deosebire de data-refresh (fetch incremental → backfill posibil), **snapshot-ul unei ore pierdute e irecuperabil** — următoarea captură e o valoare nouă (fix TO_FIX #1). 24 puncte/zi ≈ 720 min Actions/lună (confortabil în free tier). Istoricul începe de la prima captură; granularitatea „10 min" în UI va afișa punctele orare (nu există 10-min în sursă).
- **Contract de timp (fix TO_FIX #6)**: `t` e wall-clock România etichetat UTC, iar `ts` e **epoch-ul UTC al valorii etichetate** (la fel ca `parse_ts`/`make_record` pentru datele SEN — NU instant-ul local real, care ar fi cu 2-3h în urmă).
- **Testabilitate**: `SEN_STORAGE_URL` și `SEN_STORAGE_OUT` sunt overridable prin env (mock server + fișiere temporare în teste) — logica e acoperită de `tests/capture-storage.test.ts` (vezi [07-testing-ci.md](./07-testing-ci.md)).

**Runtime** — [`src/lib/sen/storage.ts`](../src/lib/sen/storage.ts) (server-only):

- `loadStorageHistory()` — seria acumulată (cache singleton, ordonată cronologic).
- `extractIspoz(payload)` / `fetchCurrentIspoz()` — parse + fetch snapshot live (pure/testabile).
- `getStorageData()` — valoarea curentă (snapshot live cu **TTL 3 min** din 0.3.23 — cardul primește polling client la 60s, deci valoarea se poate actualiza la fiecare câteva minute; **fallback la ultima captură** la eșec, **backoff 1 min** după eșec) + seria completă → răspunsul `/api/sen/storage`.

> **Nu modifica manual `data/sen-storage.json`** — e generat de `--capture-storage` (aceeași regulă ca `sen-data.json`).

## 6b. Prețurile PZU (day-ahead): `--capture-prices` + `prices.ts` + `costs.ts`

**Context**: OPCOM publică prețurile orare PZU (day-ahead, EUR/MWh) ca **export CSV public** — fără cheie, fără înregistrare (la fel cum Transelectrica expune widget-ul SEN). Endpoint: `https://www.opcom.ro/rapoarte-pzu-raportPIP-export-csv/{DD}/{MM}/{YYYY}/en?resolution=60`. Răspuns: CSV cu header `Interval,Average Price [Euro/MWh],Resolution` — 24 de intervale în zilele normale, **23 la trecerea la ora de vară** (ora 02:00–03:00 nu există), **25 la trecerea la ora de iarnă** (ora 02:00–03:00 apare de două ori). Verificat live: mediile zilnice se potrivesc exact cu cele publicate de presă (13 aug = 163,54 €/MWh; 14 aug = 142,91 €/MWh). Zilele fără date publicate (de ex. viitoare) răspund cu payload gol (0B).

**Captura** — `python3 scripts/convert-sen.py --capture-prices`:

- `fetch_prices_day(date)` — descarcă CSV-ul unei zile (UA, timeout 20s); payload gol / format neașteptat / eșec de rețea → `None` (sari peste zi, silențios).
- `parse_prices_csv(text)` — funcție pură: header + `Average Price [Euro/MWh]` (float, finit — respinge NaN/Inf/non-numeric).
- `merge_prices(existing, day)` — funcție pură: **dedupe/suprascriere pe `date`** (OPCOM poate publica revizuiri), sortare ascendentă; record-urile invalide (fără `date`/`prices`) sunt excluse.
- `capture_prices()` — descarcă **ultimele 35 de zile** (`PRICES_BACKFILL_DAYS`): backfill-ul larg e intenționat (acoperă preset-ul de 30 de zile al dashboard-ului + marjă), e indempotent (suprascrie aceleași date) și ieftin (~35 requesturi de ~600B la o rulare zilnică). Scrie **`data/sen-prices.json`**: `[{"date": "YYYY-MM-DD", "prices": [24 prețuri], "currency": "EUR"}]`. Dacă nici-o zi nu aduce date noi → „No new prices", nu rescrie nimic.
- **Automatizare**: workflow-ul [`.github/workflows/price-capture.yml`](../.github/workflows/price-capture.yml) — cron **zilnic** (`0 11 * * *` UTC ≈ 13:00–14:00 ora României, după publicarea PZU pentru ziua curentă), commit doar dacă fișierul s-a schimbat — pasul de captură **nu** folosește `continue-on-error` (toleranța la eșec e internă în script; erorile reale ies non-zero și sunt vizibile în Actions), cu `git pull --rebase --autostash` + push cu retry (3 încercări) ca la celelalte workflow-uri. ~35 requesturi/zi = neglijabil pe free tier.
- **Testabilitate**: `SEN_PRICES_URL_TEMPLATE`, `SEN_PRICES_OUT`, `SEN_PRICES_BACKFILL_DAYS` sunt overridable prin env (mock server + fișiere temporare în teste) — logica e acoperită de `tests/capture-prices.test.ts`.

**Runtime** — [`src/lib/sen/prices.ts`](../src/lib/sen/prices.ts) (server-only) + [`src/lib/sen/costs.ts`](../src/lib/sen/costs.ts) (pur):

- `loadPriceDays()` / `getPriceDays()` — seria capturată (cache singleton, ordonată pe dată); fișier lipsă/corupt → listă goală (NU 500).
- `priceForHour(day, hour)` — prețul intervalului de livrare `hour+1` (aliniere: OPCOM pune intervalul N = ora wall-clock N−1; indexare directă, contract fake-UTC — **limitare cunoscută**: pe zilele DST cu 23/25 de intervale indexarea directă poate fi decalată cu o oră după ora sărită; 2 zile/an, iar cifra e oricum o estimare etichetată — se rezolvă cu date reale când se apropie octombrie).
- `computeCosts(points, priceDays, granularity)` — **cost = Σ (importMWh × preț orar)**, venit = Σ (exportMWh × preț orar), net = cost − venit. Orele fără preț sunt **excluse** din cost (fallback onest) și numărate la `totalHours`; `hasPrices = false` dacă niciuna nu are preț → cardul afișează „prețuri indisponibile". MWh = MW × durata bucket-ului (`bucketHours`: 1h la `hour`, 10/60 la `10m`).
- `intervalStats(points)` — media consum/producție și vârful de consum pe interval (footer „Consum vs. Producție", fără prețuri).
- **IMPORTANT — ce e și ce nu e acoperit**: prețurile PZU sunt cele fixate la licitația day-ahead. Costul REAL al schimburilor include și intraday + echilibrare, care nu sunt publice în timp real → **estimare bazată pe PZU**, nu cost final (UI-ul afișează explicit eticheta).

> **Nu modifica manual `data/sen-prices.json`** — e generat de `--capture-prices` (aceeași regulă ca `sen-storage.json`).

## 7. Date live la runtime: `src/lib/sen/live.ts`

- `parseLiveLine` / `parseLivePayload` — parsează textul de la endpoint (funcții pure, testate).
- `mergeReadings(static, live)` — dedupe pe `ts` (live câștigă), sortat crescător (pură).
- `bucharestOffsetMs(date)` — offset-ul EET/EEST (+2h/+3h) după regulile UE, pentru capătul „end" al interogării (pură).
- `fetchLiveReadings(fromTs, toTs)` — fetch cu `AbortSignal.timeout(15s)` (răspuns real măsurat ~3.9s — 5s dădea timeout fals la vârfuri de trafic → fallback nemeritat pe arhivă; fix 0.3.22) și **1 retry pe eșec tranzitoriu** (rețea/timeout/body-stream/5xx, pauză 1s — 4xx determinist și payload-ul corupt nu se reîncearcă); `buildLiveUrl` construiește query-ul. **Guard anti-shift**: `hasSuspiciousNightSolar` respinge payload-urile cu `foto > 50 MW` între 00-06h (solarul nu produce noaptea — fereastra acoperă noaptea fizică de vară: primul `foto > 50` real e la 06:13), ca un payload corupt să nu suprascrie rândurile statice bune prin dedupe.
- `getLiveReadings()` — date statice + live cu **cache TTL 10 min**; la eșec Transelectrica sau în backoff, folosește **fallback pe `liveCache` stale** (până la o limită de 24h) înainte de a reveni la datele statice pure, prevenind căderea bruscă a dashboard-ului la ultima dată din fișier. Include **backoff 1 min** la eșec și o **promisiune în zbor partajată** (`inflightFetch`) pentru requesturi concurente.
- `getLiveSummary()` — summary-ul precalculat cu `latest`/`end`/`endTs`/`count` actualizate dacă live-ul a adus puncte mai noi.
- **Server-only** (folosește `fetch` server-side) — nu importa în componente client.

## 8. Valori real-time la runtime: `src/lib/sen/instant.ts`

Site-ul oficial afișează Consum/Producție/Sold „real-time" poll-uind `/sen-filter` la **10 secunde** (verificat în JS-ul lor: `setTimeout("STATE_SEN_Q()", 10000)`). Noi folosim același endpoint pentru valorile instant — nu pentru serii (alea rămân pe `sen-grafic`, cadență reală ~10 min):

- `parseInstantTimestamp(raw)` — `YY/MM/DD HH:MM:SS` (an 2 cifre: 70–99 → 19xx, 0–69 → 20xx; range-uri validate explicit, nu ne bazăm pe normalizarea `Date.UTC`) → `{t, ts}`, contract fake-UTC (pură, testată).
- `parseInstantPayload(payload)` — mapează codurile SEN (CONS→consum, PROD→productie, SOLD→sold, CARB→carbune, GAZE→hidrocarburi, APE→ape, NUCL→nuclear, EOLIAN→eolian, FOTO→foto, BMASA→biomasa) cu validare numerică strictă (regex zecimal) + **invariant anti-shift** `|sold − (consum − productie)| ≤ 5 MW` (pe datele reale sunt EGALI); `null` dacă lipsește un câmp sau timestamp-ul (pură, testată).
- `fetchCurrentInstant()` — fetch cu `AbortSignal.timeout(8s)` + **1 retry pe eșec tranzitoriu** (rețea/timeout/5xx — payload invalid fără retry, e determinist).
- `getInstantData()` — snapshot cu **TTL 10s** + **backoff 30s** + promisiune în zbor partajată; **guard prospețime**: un snapshot mai vechi de `LIVE_STALE_THRESHOLD_MS` (30 min) NU e prezentat ca „live" (→ `null`, UI-ul cade pe `summary.latest`). La eșec → `null`; site-ul nu se rupe.
- **Server-only** (folosește `fetch` server-side) — nu importa în componente client.

## Cum regenerezi datele

```bash
bun run data:convert      # rebuild complet din xlsx
bun run data:refresh      # fetch incremental live (adaugă datele noi)
python3 scripts/convert-sen.py --capture-storage   # captură manuală stocare (ISPOZ)
python3 scripts/convert-sen.py --capture-prices    # captură manuală prețuri PZU (OPCOM)
# apoi repornește serverul (loader-ul are cache singleton)
```

## Testare

Pipeline-ul complet nu e testat unitar (depinde de fișiere); logica de agregare/statistici/parsare live **da** — vezi [07-testing-ci.md](./07-testing-ci.md).
