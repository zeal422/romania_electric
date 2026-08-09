# 03 — API routes

> Vezi și: [01-arhitectura.md](./01-arhitectura.md) · [02-pipeline-date.md](./02-pipeline-date.md) · [04-strat-date.md](./04-strat-date.md)

Toate rutele sunt în `src/app/api/sen/`. Sunt `force-dynamic` (fără cache la build) dar răspund cu header-e de cache HTTP.

## Endpoint-uri

### `GET /api/sen` — date agregate într-un interval

**Query params:**

| Param         | Valori                            | Default           | Descriere                       |
| ------------- | --------------------------------- | ----------------- | ------------------------------- |
| `from`        | epoch ms                          | `summary.startTs` | Început interval (inclusiv)     |
| `to`          | epoch ms                          | `summary.endTs`   | Sfârșit interval (inclusiv)     |
| `granularity` | `raw` \| `10m` \| `hour` \| `day` | `hour`            | Mărimea bucket-ului de agregare |

**Comportament:**

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

Fără parametri. Întoarce direct conținutul `data/sen-summary.json` (tip `SenSummaryResponse`): `count`, `start`/`end`, `latest`, `stats` pe toate câmpurile, `sources`, `renewableShareAvg`, `balance` (import/export).

Folosit de pagina principală pentru KPI-uri și header, fără să încarce toate punctele.

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
- Rutele sunt subțiri: toată logica e în `src/lib/sen/*` (vezi [04-strat-date.md](./04-strat-date.md)).
