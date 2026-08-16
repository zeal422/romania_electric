# 03 — API routes

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [02-pipeline-date.md](./02-pipeline-date.md) · [04-strat-date.md](./04-strat-date.md)

Toate rutele sunt în `src/app/api/sen/`. Sunt `force-dynamic` (fără cache la build) dar răspund cu header-e de cache HTTP.

## Endpoint-uri

| Endpoint               | Rol                                                            |
| ---------------------- | -------------------------------------------------------------- |
| `GET /api/sen`         | Date agregate într-un interval                                 |
| `GET /api/sen/summary` | KPI global precalculat                                         |
| `GET /api/sen/instant` | Valori real-time (Consum/Producție/Sold + mix), `null` la eșec |
| `GET /api/sen/storage` | Stocare (ISPOZ): valoare curentă + serie acumulată             |
| `GET /api/sen/costs`   | Costuri estimate import/export (volume × prețuri PZU)          |
| `GET /api/sen/export`  | Export CSV                                                     |

### `GET /api/sen` — date agregate într-un interval

**Query params:**

| Param         | Valori                            | Default           | Descriere                       |
| ------------- | --------------------------------- | ----------------- | ------------------------------- |
| `from`        | epoch ms                          | `summary.startTs` | Început interval (inclusiv)     |
| `to`          | epoch ms                          | `summary.endTs`   | Sfârșit interval (inclusiv)     |
| `granularity` | `raw` \| `10m` \| `hour` \| `day` | `hour`            | Mărimea bucket-ului de agregare |

**Comportament:**

- **Datele includ și live-ul Transelectrica**: fiecare request merge datele statice cu ultimele date live (fetch cu cache TTL 10 min în `src/lib/sen/live.ts`; timeout 15s + 1 retry pe eșec tranzitoriu (rețea/5xx) — fix 0.3.22). Dacă Transelectrica e indisponibilă, se folosește mai întâi `liveCache`-ul stale existent în memorie (până la 24h), iar datele statice sunt ultimul resort — API-ul rămâne funcțional.
- Filtrează după `[from, to]`, agreghează în bucket-uri, calculează media fiecărui câmp.
- La `granularity=raw` pe intervale mari se aplică **downsampling uniform la 1.200 puncte** (`MAX_POINTS`) — protecție intenționată, nu o corecta.
- Răspunsul include și statistici pe interval: `count`, `consum`/`productie`/`sold` (min/max/avg) și `renewableShareAvg`.

**Răspuns** (`SenApiResponse`, vezi [`types.ts`](../src/lib/sen/types.ts)):

```json
{
  "range": { "from": "…", "to": "…" },
  "granularity": "hour",
  "points": [
    { "t": "…", "ts": 0, "consum": 0, "productie": 0, "sold": 0,
      "carbune": 0, "hidrocarburi": 0, "ape": 0, "nuclear": 0,
      "eolian": 0, "foto": 0, "biomasa": 0, "count": 6 }
  ],
  "summary": { "count": 0, "consum": {…}, "productie": {…}, "sold": {…}, "renewableShareAvg": 0 }
}
```

**Exemple:**

```
GET /api/sen?granularity=day
GET /api/sen?from=1782929466000&to=1786212477000&granularity=hour
GET /api/sen?granularity=raw        # va face downsample la ≤1200 puncte
```

**Cache:** `public, s-maxage=60, stale-while-revalidate=300`.

---

### `GET /api/sen/summary` — KPI global precalculat

Fără parametri. Întoarce `data/sen-summary.json` (tip `SenSummaryResponse`) cu `latest`/`end`/`endTs`/`count` **actualizate din live** dacă Transelectrica are înregistrări mai noi (vezi `getLiveSummary`). Statisticile globale (`stats`, `balance`, `renewableShareAvg`) rămân cele precalculate — sunt pe tot istoricul.

Folosit de pagina principală pentru KPI-uri și header, fără să încarce toate punctele.

**Cache:** `public, s-maxage=120, stale-while-revalidate=600`.

---

### `GET /api/sen/instant` — valori real-time

Fără parametri. Întoarce snapshot-ul INSTANT de la `/sen-filter` — aceleași valori pe care site-ul oficial le afișează în bara „Consum / Producție / Sold" (poll-uite de ei la 10s), granularitate de secunde (tip `InstantData`, vezi [`types.ts`](../src/lib/sen/types.ts)):

```json
{
  "t": "2026-08-13T15:12:27.000Z",
  "ts": 1786626747000,
  "consum": 4506,
  "productie": 5007,
  "sold": -501,
  "carbune": 584,
  "hidrocarburi": 1001,
  "ape": 260,
  "nuclear": 0,
  "eolian": 396,
  "foto": 2703,
  "biomasa": 54
}
```

- **Fallback lin**: la eșec/stale (Transelectrica indisponibilă, snapshot mai vechi de 30 min) răspunde **`null`** — UI-ul cade pe `summary.latest` (KPI/Mix/Header), site-ul nu se rupe. Fetch intern: timeout 8s + 1 retry pe eșec tranzitoriu + backoff 30s (modulul [`src/lib/sen/instant.ts`](../src/lib/sen/instant.ts)).
- **Polling client**: [`src/hooks/use-instant-data.ts`](../src/hooks/use-instant-data.ts) (`useInstantData`, query key `["sen","instant"]`) — `refetchInterval 30s`, `staleTime 15s`.

**Cache:** `public, s-maxage=10, stale-while-revalidate=30`.

---

### `GET /api/sen/storage` — stocare (ISPOZ)

Fără parametri. Întoarce valoarea curentă de stocare + seria acumulată de capturi orare (tip `StorageApiResponse`, vezi [`types.ts`](../src/lib/sen/types.ts)):

```json
{
  "current": { "t": "…", "ts": 0, "ispoz": 39, "source": "live" },
  "history": [
    { "t": "…", "ts": 0, "ispoz": 39 },
    { "t": "…", "ts": 0, "ispoz": 41 }
  ],
  "fetchedAt": 1782930000000
}
```

> Contract de timp (fix TO_FIX #6): `t` e wall-clock România etichetat UTC, iar `ts` e **epoch-ul UTC al valorii `t` etichetate** (la fel ca la datele SEN) — nu instant-ul local real.

- `current` — snapshot-ul cel mai recent: fetch live la `/sen-filter` (TTL 3 min din 0.3.23 — polling client 60s, deci valoarea se actualizează la câteva minute) sau, la eșec, **cea mai recentă valoare cunoscută**. `current.source` e proveniența valorii:
  - `"live"` — snapshot de la `/sen-filter`, fie proaspăt (în TTL), fie **stale** (din cache, după expirarea TTL-ului — rămâne „live", nu „captură");
  - `"capture"` — ultimul punct din istoricul acumulat (fallback pur, când nu există niciun snapshot live).
    `null` doar dacă nu există încă nicio valoare cunoscută.
- `fetchedAt` — momentul real în care a fost obținut `current`: > 0 pentru valorile live (chiar stale — timestamp-ul original), `0` pentru punctul din istoric (`source: "capture"`).
- `history` — seria completă din `data/sen-storage.json`, ordonată cronologic (începe de la prima captură a workflow-ului `storage-capture`).
- Folosit de `StorageCard` prin [`src/hooks/use-storage-data.ts`](../src/hooks/use-storage-data.ts) (query key `["sen","storage"]`, `refetchInterval 60s`).

**Cache:** `public, s-maxage=120, stale-while-revalidate=600`.

---

### `GET /api/sen/costs` — costuri estimate import/export

**Query params:** `from`, `to` (epoch ms, opționali — default capetele întregului set de citiri).

**Răspuns** (`CostsApiResponse`, vezi [`types.ts`](../src/lib/sen/types.ts)):

```json
{
  "range": { "from": "…", "to": "…" },
  "costs": {
    "importMWh": 20520,
    "exportMWh": 6120,
    "cost": 3960000,
    "revenue": 480000,
    "net": 3480000,
    "coveredHours": 24,
    "totalHours": 24,
    "hasPrices": true
  }
}
```

- **Costul estimat al schimburilor** în intervalul selectat: volumele reale Transelectrica (MWh, agregat orar) × prețurile PZU orare OPCOM (EUR/MWh). Cost = Σ (importMWh × preț), venit = Σ (exportMWh × preț), `net = cost − venit` (pozitiv = plătim net, negativ = încasăm net).
- **Orele fără preț** (zi fără captură, interval în afara istoricului) sunt **excluse** din cost/venit; `hasPrices = false` dacă niciuna nu are preț → UI-ul afișează „prețuri indisponibile", nu zerouri.
- **Eticheta de onestitate** (afișată de UI): prețurile PZU sunt cele day-ahead; costul real include și intraday + echilibrare — cifra e o **estimare**, nu costul final.
- Datele vin din `getLiveReadings()` (volume) + `getPriceDays()` (prețuri capturate de workflow-ul `price-capture` în `data/sen-prices.json`) — vezi [02-pipeline-date.md](./02-pipeline-date.md).

**Cache:** `public, s-maxage=60, stale-while-revalidate=300`.

---

### `GET /api/sen/export` — export CSV

**Query params:** `from`, `to` (epoch ms, opționali — default capetele întregului set).

**Răspuns:** `text/csv; charset=utf-8` cu `Content-Disposition: attachment; filename="sen-export.csv"`.

- Separator: `;` (convenție RO/Excel). Zecimal: `.`.
- Prima linie = header: `Data;Consum[MW];Medie Consum[MW];Productie[MW];Carbune[MW];Hidrocarburi[MW];Ape[MW];Nuclear[MW];Eolian[MW];Foto[MW];Biomasa[MW];Sold[MW]`.
- Coloana `Data` are formatul `YYYY-MM-DD HH:MM:SS` (fără `T`/`Z`).
- Escape CSV pentru valori cu `"`, `,`, `\n`, `;`.

**Exemplu:** `GET /api/sen/export?from=…&to=…`

**Cache:** `public, s-maxage=120, stale-while-revalidate=600`.

## Cum apelează clientul API-ul

- [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts): `useSenSummary()` (query key `["sen","summary"]`, `refetchInterval 60s`) și `useSenData(from, to, granularity)` (query key `["sen","data",from,to,granularity]`, `refetchInterval 5 min`).
- [`src/hooks/use-instant-data.ts`](../src/hooks/use-instant-data.ts): `useInstantData()` (query key `["sen","instant"]`, `refetchInterval 30s`).
- React Query: `staleTime 60s`, `refetchOnWindowFocus: true` (revenirea pe tab reîmprospătează — live feedback, ca pe site-ul sursei), `retry: 1` (configurat în [`src/components/providers.tsx`](../src/components/providers.tsx)).
- Exportul se face direct din browser: `window.open('/api/sen/export?…')` în [`filters.tsx`](../src/components/dashboard/filters.tsx).

## Note pentru dezvoltatori

- **Nu inventa granularități noi** — doar `raw | 10m | hour | day` (tipul [`Granularity`](../src/lib/sen/types.ts)).
- `from`/`to` sunt **epoch ms** (numere), nu ISO.
- Rutele sunt subțiri: toată logica e în `src/lib/sen/*` (vezi [04-strat-date.md](./04-strat-date.md)). Fetch-ul live e în `live.ts` — nu-l replica în rute.
