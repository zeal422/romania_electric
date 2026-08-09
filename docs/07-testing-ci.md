# 07 — Testare & CI

> Vezi și: [04-strat-date.md](./04-strat-date.md) · [AGENTS.md](../AGENTS.md) · [README.md](../README.md)

## Comanda principală: `bun run check`

Rulează **tot pipeline-ul CI într-o singură comandă**, în ordinea recomandată (verificările rapide întâi, build-ul scump la final; oprire la prima eroare):

```bash
bun run check
```

Ordinul (definit în `package.json`):

1. **`format:check`** — Prettier (verifică `src/**`, `tests/**`, `*.md` din rădăcină și `docs/**/*.md`)
2. **`docs:check`** — verifică că documentația e la zi cu codul (vezi mai jos)
3. **`lint`** — ESLint
4. **`typecheck`** — `tsc --noEmit` (TypeScript strict)
5. **`test`** — `bun test` (103 teste unitare)
6. **`build`** — `next build` (build standalone, **include validarea tipurilor** — `ignoreBuildErrors` e eliminat)

## Verificarea că documentația e la zi (`docs:check`)

Documentația din `docs/` se poate „demoda" pe măsură ce codul evoluează. Ca să nu se întâmple asta în tăcere, `bun run check` include un pas care detectează documente stale:

- **Manifest**: [`docs/.docs-manifest.json`](../docs/.docs-manifest.json) mapează fiecare document la fișierele sursă pe care le acoperă, împreună cu **hash-ul sha256** al fiecărui fișier la momentul ultimei verificări.
- **Detecție**: [`scripts/check-docs-stale.sh`](../scripts/check-docs-stale.sh) recalculează sha256 pentru fiecare fișier acoperit și îl compară cu cel din manifest. Dacă hash-ul diferă (conținut modificat), fișierul lipsește sau nu are hash, documentul respectiv e raportat ca stale și check-ul eșuează, listând exact ce trebuie actualizat.
- **De ce hash-uri, nu `mtime`**: după `git clone`/`git checkout` toate fișierele primesc `mtime` proaspăt, ceea ce ar produce false positive. Hash-urile de conținut sunt deterministe și imune la reset-uri de timp.
- **Rezolvare**: actualizezi documentul ca să reflecte codul, apoi rulezi `bun run docs:mark-verified` (scriptul [`scripts/mark-docs-verified.sh`](../scripts/mark-docs-verified.sh) recalculează hash-urile din manifest).

> **Flux corect**: modifică cod → actualizează documentația → `bun run docs:mark-verified` → `bun run check`. Nu rula `docs:mark-verified` fără să actualizezi documentele — altfel doar amâni detectarea.

> **Indexul (00) e actualizat manual**: `docs/00-index.md` are `covers` gol intenționat — când adaugi un document nou, adaugă-i un rând în index și în [08-harta-cautare.md](./08-harta-cautare.md) de mână.

Exemplu de output la cod modificat fără docs:

```
⚠️  Documentație posibil stale — codul a fost modificat fără actualizarea documentației:
  • docs/04-strat-date.md
      - modificat față de documentație: src/lib/sen/aggregate.ts
```

> `check:hydration` NU e inclus în `check` — necesită `agent-browser` instalat (vezi mai jos). Rulează-l separat când ai browser headless disponibil.

## Testele unitare (`bun test`)

- **Runner**: Bun (`bun:test`) — zero config.
- **Locație**: `tests/sen/` (4 fișiere) + `tests/local-preference.test.ts` — **5 fișiere, 103 teste** (plus verificări pe date reale în loop).
- **Ce acoperă**:

| Fișier                           | Funcții testate                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/sen/aggregate.test.ts`    | `mean`, `bucketKey` (raw/10m/hour/day), `aggregate` (grupare, medie, rotunjire, sortare, shape-ul punctelor), `filterByRange` (limite incluzive, capete opționale, gol), `downsample` (limite, păstrare primul/ultimul, maxPoints=1)                                                                                                                                                                                                                                        |
| `tests/sen/stats.test.ts`        | `fieldStats`, `renewableShare`, `sourceShares`, `balanceStats` (split `> 0` import / `< 0` export), `latestReading`                                                                                                                                                                                                                                                                                                                                                         |
| `tests/sen/format.test.ts`       | `formatNumber` (separatori RO, zecimale, non-finit), `formatMW`, `formatSigned`, `formatSold` (Import/Export/Echilibru — pozitiv = import), `formatPercent`, `mwToGwh`, `formatDateTime` (an inclus/nu + TZ-independență), `formatTime`, `formatAxisTick`, `formatLastUpdatedLabel`, `granularityLabel`                                                                                                                                                                     |
| `tests/sen/live.test.ts`         | `parseLiveLine`/`parseLivePayload` (format live cu SOLD pe poziția 4 — ordinea diferă de xlsx!, markeri `*`, rânduri invalide), `mergeReadings` (dedupe pe ts, sortare), `bucharestOffsetMs` (EET/EEST + granițe DST), `buildLiveUrl` (query params), `getLiveReadings`/`getLiveSummary` (merge + fallback + fără date noi, timestamp relativ la `endTs` static), `hasSuspiciousNightSolar` (guard anti-shift, fereastra 00-06h: foto noaptea la 02/04:30/05:30, ziua, gol) |
| `tests/local-preference.test.ts` | `readLocalPreference` (fallback la `null`/excepție/`isValid` eșuat, păstrare valoare validă, string brut fără JSON, **fără validator → `string` (union), cu type predicate → `T`**), `writeLocalPreference` (succes + eșec fără throw), `granularitiesForPreset` (24h fără `day`; 30d/all fără `raw`/`10m`; 3d/7d = toate) — logica pură a lui `useLocalPreference` + regula de compatibilitate, testată fără DOM                                                           |

- **Regulă**: orice funcție nouă de calcul din `src/lib/sen/` **trebuie** să aibă test unitar (logică pură generică, ex: `src/lib/local-preference.ts` + `granularitiesForPreset` din `types.ts`, testate în `tests/local-preference.test.ts`). Ceea ce contează e **acoperirea**, nu directorul fizic — `bun test` găsește testele oriunde. Vezi [AGENTS.md](../AGENTS.md).

```bash
bun test            # rulează toate testele
bun test --watch    # watch mode
bun test --coverage # acoperire
```

## Check-ul de hidratare (`bun run check:hydration`)

- Script: `scripts/check-hydration.sh`.
- Deschide aplicația într-un **browser headless** (`agent-browser`), așteaptă `networkidle`, capturează console + page errors, caută tipare de mismatch de hidratare React (`hydrated but some attributes`, `did not match`, `Hydration failed`, etc.).
- **Exit**: `0` = curat, `1` = erori găsite, `2` = nu a putut deschide (agent-browser lipsă).
- **Necesită**: server de dev pornit pe :3000 + `agent-browser` instalat (`agent-browser install`).

```bash
# 1. pornește serverul într-un terminal
bun run dev
# 2. în altul
bun run check:hydration
# sau cu URL custom
./scripts/check-hydration.sh http://localhost:3000
```

**Protocol pentru agenți (cine pornește / oprește serverul)** — vezi și [AGENTS.md §4.10](../AGENTS.md):

1. **Verifică mai întâi dacă serverul rulează deja**: `curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000; echo " exit=$?"` → **orice răspuns HTTP** (2xx/3xx/4xx/5xx) = e pornit, folosește-l direct. Dacă nu primești răspuns HTTP, clasifică eșecul după **exit status-ul curl**: `7` (refuz de conexiune) = portul e liber; `28` (timeout) sau orice altă eroare de transport = **stare necunoscută** — nu presupune că portul e liber și **nu porni** un server pe baza unui rezultat ambiguu (reîncearcă sau întreabă utilizatorul).
2. **Dacă nu rulează și vrei să-l pornești, cere aprobarea explicită a utilizatorului întâi** (permisiune sau preferința lui de a-l porni personal) — **nu porni niciodată un server din proprie inițiativă**, indiferent dacă utilizatorul e activ sau inactiv.
3. **După verificare: oprește serverul DOAR dacă TU l-ai pornit** — oprește exact grupul tău salvat la pornire, după ce verifici identitatea PID-ului (procesul e încă serverul tău, nu un PID reutilizat; vezi [AGENTS.md §4.10](../AGENTS.md)); **NU folosi `pkill -f 'next dev'`** (potrivește și procesele utilizatorului) și curăță fișierele tale de metadata + log-ul `/tmp/sen-dev-<run-id>.*`. Dacă utilizatorul l-a pornit, lasă-l în pace — nu-l opri.

De ce există: theme toggle-ul citește `resolvedTheme` (depinde de browser) — fix-ul e `useMounted()` (`useSyncExternalStore`), vezi [05-ui-dashboard.md](./05-ui-dashboard.md).

## Alte comenzi de verificare

| Comandă                | Ce face                            |
| ---------------------- | ---------------------------------- |
| `bun run typecheck`    | `tsc --noEmit`                     |
| `bun run lint`         | ESLint                             |
| `bun run format`       | Prettier — scrie                   |
| `bun run format:check` | Prettier — verifică                |
| `bun run data:convert` | Regenerează `data/*.json` din xlsx |

## Workflow recomandat

1. Fă modificarea (mică, localizată).
2. Adaugă/actualizează teste unitare pentru logica nouă.
3. Rulează `bun run check` (tot pipeline-ul).
4. Dacă ai `agent-browser`: `bun run check:hydration` cu serverul pornit (întâi verifici dacă rulează; dacă trebuie să-l pornești tu, cere acordul și oprește-l după — vezi §„Protocol pentru agenți").
5. Verifică vizual în browser (teme light/dark + mobil ~390px) și consola fără erori.

## Statutul curent

- Typecheck: curat · Lint: curat · Prettier: curat · 103/103 teste · Build standalone reușit.
- Verificare în browser (Recharts, KPI, tabel): fără erori consolă, fără hydration warnings.
