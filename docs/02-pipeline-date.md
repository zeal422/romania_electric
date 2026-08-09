# 02 — Pipeline-ul de date

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [04-strat-date.md](./04-strat-date.md) · [03-api.md](./03-api.md)

## Privire de ansamblu

```
upload/Grafic_SEN.xlsx   ← fișier sursă Transelectrica (nu se modifică manual)
        │
        │  bun run data:convert  (= python3 scripts/convert-sen.py)
        ▼
data/sen-data.json       ← 5.546 înregistrări tipizate, sortate crescător după ts
data/sen-summary.json    ← statistici globale precalculate (KPI instant)
        │
        ▼
src/lib/sen/loader.ts    ← cache singleton, server-only (node:fs)
        │
        ▼
API routes (/api/sen, /api/sen/summary, /api/sen/export)
```

## 1. Sursa: `upload/Grafic_SEN.xlsx`

- Foaia „Grafic SEN", header cu 12 coloane: `Data`, `Consum[MW]`, `Medie Consum[MW]`, `Productie[MW]`, `Carbune[MW]`, `Hidrocarburi[MW]`, `Ape[MW]`, `Nuclear[MW]`, `Eolian[MW]`, `Foto[MW]`, `Biomasa[MW]`, `Sold[MW]`.
- Interval: **01.07.2026 → 08.08.2026**, înregistrări la ~10 minute.
- Format timp în sursă: `DD-MM-YYYY HH:MM:SS` (wall-clock, ora României).
- Fișierul se înlocuiește manual când apar date noi.

> **Contractul de timp (important)**: valorile sursă sunt **wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO** (sufix `.000Z`), iar `ts` e epoch-ul corespunzător. Nu „conversionezi” fusurile orare — cifrele din sursă trebuie să apară identic în UI. **Implementare**: toate funcțiile de afișare (`format.ts`) și de agregare (`bucketKey` din `aggregate.ts`) folosesc **getters/constructori UTC** (`getUTCHours`, `Date.UTC`, `timeZone: "UTC"`), ca rezultatul să fie identic pe orice fus orar (server sau browser). **Nu înlocui cu getters locale** — pe un sistem EEST, `18:07` din sursă ar deveni `21:07` în UI.

## 2. Convertorul: `scripts/convert-sen.py`

Rulează cu `bun run data:convert`. Ce face:

1. Citește `upload/Grafic_SEN.xlsx` cu `openpyxl` (foaia „Grafic SEN").
2. Parsează fiecare rând: timp `DD-MM-YYYY HH:MM:SS` → ISO `YYYY-MM-DDTHH:MM:SS.000Z` + `ts` epoch ms.
3. Normalizează valorile: elimină markerii de estimare (`6945*` → `6945`), trim-uit stringuri.
4. Sare rândurile invalide (timp neparsabil, valori lipsă).
5. **Sortează crescător după `ts`** (fișierul sursă e descrescător).
6. Scrie `data/sen-data.json` (compact) și `data/sen-summary.json` (indentat, `ensure_ascii=False`).

> **Nu modifica manual `data/*.json`.** Dacă „repari" datele „ca să iasă testele", ai greșit — repară scriptul sau logica, nu datele. Dacă schimbi structura output-ului, actualizează și tipurile din [`src/lib/sen/types.ts`](../src/lib/sen/types.ts) și testele.

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

Toate valorile numerice sunt în **MW**. `sold` pozitiv = export, negativ = import.

## 4. Output: `data/sen-summary.json`

Statistici globale precalculate pentru KPI-uri instant:

- `count`, `start`/`end`, `startTs`/`endTs`
- `latest` — cea mai recentă înregistrare completă
- `stats` — `min`/`max`/`avg` pentru fiecare câmp numeric
- `sources` — lista surselor
- `renewableShareAvg` — ponderea regenerabilă medie (%)
- `balance` — `importSamples`, `exportSamples`, `importShare`, `avgImport`, `avgExport`, `netAvg`

Structura corespunde tipului [`SenSummaryResponse`](../src/lib/sen/types.ts).

## 5. Loader: `src/lib/sen/loader.ts`

- Citește JSON-urile cu `node:fs` și le ține în memorie (cache singleton pe viața procesului).
- `loadReadings()` → array sortat; `loadSummary()` → obiectul summary.
- `getCachedReadings()` → sincron, `null` dacă nu sunt încă încărcate (util în teste).
- `resetCache()` → invalidează cache-ul (folosit în teste).
- **Server-only**: conține `node:fs` — **nu** îl importa în componente client. Documentat în [AGENTS.md](../AGENTS.md).

## Cum regenerezi datele

```bash
# după ce ai înlocuit upload/Grafic_SEN.xlsx:
bun run data:convert

# apoi repornește serverul (loader-ul are cache singleton)
```

## Testare

Pipeline-ul complet nu e testat unitar (depinde de fișiere); logica de agregare/statistici **da** — vezi [07-testing-ci.md](./07-testing-ci.md).
