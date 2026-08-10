# 03 — API routes

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [02-pipeline-date.md](./02-pipeline-date.md) · [04-strat-date.md](./04-strat-date.md)

Toate rutele sunt în `src/app/api/sen/`. Sunt `force-dynamic` (fără cache la build) dar răspund cu header-e de cache HTTP.

## Endpoint-uri

| Endpoint               | Rol                                                |
| ---------------------- | -------------------------------------------------- |
| `GET /api/sen`         | Date agregate într-un interval                     |
| `GET /api/sen/summary` | KPI global precalculat                             |
| `GET /api/sen/storage` | Stocare (ISPOZ): valoare curentă + serie acumulată |
| `GET /api/sen/export`  | Export CSV                                         |

### `GET /api/sen` — date agregate într-un interval

**Query params:**

| Param         | Valori                            | Default           | Descriere                       |
| ------------- | --------------------------------- | ----------------- | ------------------------------- |
| `from`        | epoch ms                          | `summary.startTs` | Început interval (inclusiv)     |
| `to`          | epoch ms                          | `summary.endTs`   | Sfârșit interval (inclusiv)     |
| `granularity` | `raw` \| `10m` \| `hour` \| `day` | `hour`            | Mărimea bucket-ului de agregare |

**Comportament:**

- **Datele includ și live-ul Transelectrica**: fiecare request merge datele statice cu ultimele date live (fetch cu cache TTL 10 min în `src/lib/sen/live.ts`). Dacă Transelectrica e indisponibilă, se folosesc doar datele statice (fallback silențios) — API-ul rămâne funcțional.
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

- `current` — snapshot-ul cel mai recent: fetch live la `/sen-filter` (TTL 10 min) sau, la eșec, **cea mai recentă valoare cunoscută**. `current.source` e proveniența valorii:
  - `"live"` — snapshot de la `/sen-filter`, fie proaspăt (în TTL), fie **stale** (din cache, după expirarea TTL-ului — rămâne „live", nu „captură");
  - `"capture"` — ultimul punct din istoricul acumulat (fallback pur, când nu există niciun snapshot live).
    `null` doar dacă nu există încă nicio valoare cunoscută.
- `fetchedAt` — momentul real în care a fost obținut `current`: > 0 pentru valorile live (chiar stale — timestamp-ul original), `0` pentru punctul din istoric (`source: "capture"`).
- `history` — seria completă din `data/sen-storage.json`, ordonată cronologic (începe de la prima captură a workflow-ului `storage-capture`).
- Folosit de `StorageCard` prin [`src/hooks/use-storage-data.ts`](../src/hooks/use-storage-data.ts) (query key `["sen","storage"]`, `staleTime 5 min`).

**Cache:** `public, s-maxage=120, stale-while-revalidate=600`.

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

- [`src/hooks/use-sen-data.ts`](../src/hooks/use-sen-data.ts): `useSenSummary()` (query key `["sen","summary"]`) și `useSenData(from, to, granularity)` (query key `["sen","data",from,to,granularity]`).
- React Query: `staleTime 60s`, fără `refetchOnWindowFocus`, `retry: 1` (configurat în [`src/components/providers.tsx`](../src/components/providers.tsx)).
- Exportul se face direct din browser: `window.open('/api/sen/export?…')` în [`filters.tsx`](../src/components/dashboard/filters.tsx).

## Note pentru dezvoltatori

- **Nu inventa granularități noi** — doar `raw | 10m | hour | day` (tipul [`Granularity`](../src/lib/sen/types.ts)).
- `from`/`to` sunt **epoch ms** (numere), nu ISO.
- Rutele sunt subțiri: toată logica e în `src/lib/sen/*` (vezi [04-strat-date.md](./04-strat-date.md)). Fetch-ul live e în `live.ts` — nu-l replica în rute.
