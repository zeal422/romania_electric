# AGENTS.md — Ghid pentru agenți AI

Acest fișier îi ajută pe agenții AI (și pe orice dezvoltator nou) să lucreze în acest proiect **fără să facă greșeli**. Citește-l integral înainte de a modifica codul.

> **Documentație detaliată per zonă**: începe cu indexul [`docs/00-index.md`](./docs/00-index.md), apoi mergi la documentul zonei (01 arhitectură, 02 pipeline date, 03 API, 04 strat de date, 05 UI, 06 design, 07 testare/CI). Pentru căutare rapidă „întrebare → fișier", folosește [`docs/08-harta-cautare.md`](./docs/08-harta-cautare.md).

## 1. Ce este acest proiect

Dashboard interactiv pentru **Sistemul Energetic Național (SEN) al României**, cu date Transelectrica:

- **5.546 de înregistrări** la ~10 minute (01.07.2026 → 08.08.2026).
- Câmpuri: `consum`, `medieConsum`, `productie`, `carbune`, `hidrocarburi`, `ape`, `nuclear`, `eolian`, `foto`, `biomasa`, `sold` (pozitiv = export, negativ = import).
- Stack: **Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui + Recharts + React Query**, rulat cu **Bun**.

## 2. Comenzi esențiale (rulează-le înainte de a declara orice „gata")

```bash
bun install            # instalează dependențele (Bun, NU npm/pnpm/yarn)
bun run dev            # server de dezvoltare pe :3000
bun run check          # CI complet: format → docs → lint → typecheck → teste → build
bun test               # 63 teste unitare — TOATE trebuie să treacă
bun run typecheck      # tsc --noEmit — trebuie să fie curat
bun run lint           # ESLint — trebuie să fie curat
bun run format:check   # Prettier — trebuie să fie curat
bun run docs:check     # verifică că documentația e la zi cu codul
bun run docs:mark-verified  # marchează documentația ca verificată (după actualizare)
bun run build          # build de producție (testează înainte de release)
bun run check:hydration  # verifică erori de hidratare în browser (necesită agent-browser)
```

**Regulă de aur**: după orice modificare, rulează `bun run check` (sau măcar `bun run typecheck` + `bun test` + `bun run lint`). Dacă unul e roșu, nu spune „gata" — repară.**Documentația trebuie ținută la zi**: `bun run check` include un pas care compară fiecare document din `docs/` cu fișierele sursă pe care le acoperă (manifest: `docs/.docs-manifest.json`, bazat pe hash-uri sha256 — imun la reset-uri de `mtime` de la `git checkout`). Dacă ai modificat un fișier din `src/`, `scripts/`, `tests/` sau config, iar check-ul raportează un document stale, **actualizează documentul** ca să reflecte codul, apoi rulează `bun run docs:mark-verified`. Nu marca ca verificat fără să actualizezi documentul — altfel doar amâni problema. (Reformatezi doar un `.md` cu `bun run format`? Atunci nu e nevoie de `docs:mark-verified` — documentele nu se acoperă între ele.)

## 3. Arhitectură — ce e unde și de ce

```
src/lib/sen/        ← LOGICA DE DATE. Pură, tipizată, deterministă, testată.
src/app/api/sen/    ← API routes subțiri (fără logică de business).
src/hooks/          ← Hook-uri client (React Query).
src/components/dashboard/ ← UI dashboard. src/components/ui/ = shadcn/ui (nu modifica de mână).
data/               ← sen-data.json + sen-summary.json (GENERATE, nu le edita manual).
scripts/            ← convert-sen.py (pipeline date) + check-hydration.sh (CI).
tests/sen/          ← 63 teste unitare pentru lib/sen.
upload/             ← Grafic_SEN.xlsx (sursa datelor).
```

## 4. Reguli critice (încălcarea lor = bug)

### 4.1. Loader-ul rulează DOAR pe server

`src/lib/sen/loader.ts` folosește `node:fs` și `process.cwd()`. **Nu importa `@/lib/sen/loader` în cod de client** (componente `"use client"`, hooks, `page.tsx` care e client). Barrel-ul `@/lib/sen` (`index.ts`) e **client-safe** (doar logică pură) — `loader` nu trece prin el; API routes îl importă direct. Dacă ai nevoie de date pe client, folosește hook-urile din `src/hooks/use-sen-data.ts` (React Query + fetch la `/api/sen*`).

### 4.2. Logica de date rămâne pură

`aggregate.ts`, `stats.ts`, `format.ts` conțin funcții pure. Păstrează-le pure: fără `Date.now()` nedeterminist, fără side-effects, fără acces la sistemul de fișiere. Orice funcție nouă de calcul **trebuie** să aibă test unitar în `tests/sen/`.

### 4.3. Datele din `data/` sunt generate

Nu edita manual `sen-data.json` / `sen-summary.json`. Sunt produse de `scripts/convert-sen.py` din `upload/Grafic_SEN.xlsx` (`bun run data:convert`). Dacă „repar" niște date „ca să iasă testele", ai greșit — repară scriptul sau logica, nu datele.

### 4.4. Interfața este în română

Toate etichetele, tooltip-urile, aria-label-urile și mesajele UI sunt în **română** (diacritice corecte: „Producție", „Cărbune", „Balanța"). Nu introduce text în engleză în UI. Codul (variabile, comentarii) poate fi în engleză sau română — proiectul folosește română pentru comentarii; păstrează stilul existent.

### 4.5. Culorile și metadatele surselor au o singură sursă de adevăr

Totul despre surse (culori semantice, etichete, ordinea de afișare, clasificare fosil/regenerabil) e în **`src/lib/sen/constants.ts`** (`SOURCES`, `SOURCE_ORDER`, `RENEWABLE_FIELDS`, `FOSSIL_FIELDS`). **Nu hardcoda culori sau etichete în componente.** Ordinea contorsionată `SOURCE_ORDER` (fosil jos → regenerabil sus) e intenționată pentru stacked area.

### 4.6. Granularități și API — nu inventa

Granularități valide: `raw` | `10m` | `hour` | `day` (vezi `types.ts`). Endpoint-uri existente: `/api/sen`, `/api/sen/summary`, `/api/sen/export`. Parametrii `from`/`to` sunt **epoch ms**. La `raw` pe intervale mari, API-ul face downsampling la 1.200 de puncte — nu „corecta" asta, e protecție intenționată pentru client.

### 4.7. Timestamps: afișează fidel, nu „repara" anul

Datele sursă sunt etichetate cu anul 2026. `format.ts` le afișează fidel. **Nu „corecta” anul la 2025/2024** crezând că e o greșeală. La fel, **valorile sursă sunt wall-clock (ora locală România, așa cum apar în fișierul Transelectrica), păstrate fidel — fără conversie EET/EEST — și etichetate ca UTC în ISO** (ex: `18:07` în sursă → `T18:07:57.000Z`).

**Regulă de implementare (contract de timp)**: toate funcțiile de afișare (`format.ts`) și de bucket (`aggregate.ts`) folosesc **getters/constructori UTC** (`getUTCHours`, `getUTCDate`, `Date.UTC`, `timeZone: "UTC"`). **Nu folosi getters locale** — pe un sistem EEST, `18:07` din sursă ar apărea `21:07` în UI. Testele de `format`/`aggregate` sunt **independente de fusul orar** (folosesc UTC), deci trec identic cu `TZ=UTC` sau `TZ=Europe/Bucharest` — poți verifica manual oricând cu `TZ=Europe/Bucharest bun test`.

### 4.8. Tema: dark-first

Proiectul e dark-first „control room" cu accent emerald. Folosește variabilele Tailwind existente (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border` etc.) și clasele dark: unde e nevoie. Nu introduce culori hardcoded hex în UI pentru fundaluri/text (hex-urile din `constants.ts` sunt doar pentru seriile de date).

### 4.9. Unde să cauți informații (harta documentației)

Pentru detalii pe zone, începe cu indexul [`docs/00-index.md`](./docs/00-index.md), apoi consultă documentul zonei:

- **Arhitectură & flux de date**: [`docs/01-arhitectura.md`](./docs/01-arhitectura.md)
- **Pipeline xlsx → JSON**: [`docs/02-pipeline-date.md`](./docs/02-pipeline-date.md)
- **API routes & parametri**: [`docs/03-api.md`](./docs/03-api.md)
- **Funcțiile pure din `src/lib/sen/`**: [`docs/04-strat-date.md`](./docs/04-strat-date.md)
- **Componentele dashboard**: [`docs/05-ui-dashboard.md`](./docs/05-ui-dashboard.md)
- **Design, teme, culori**: [`docs/06-design.md`](./docs/06-design.md)
- **Teste & CI**: [`docs/07-testing-ci.md`](./docs/07-testing-ci.md)
- **Index „întrebare → fișier"**: [`docs/08-harta-cautare.md`](./docs/08-harta-cautare.md)

Regula de bază: dacă vrei să schimbi ceva legat de **date** → `src/lib/sen/`, de **HTTP** → `src/app/api/sen/`, de **UI** → `src/components/dashboard/` sau `src/hooks/`. Nu „găsi" singur locul — harta te duce direct.

## 5. Lucruri de evitat (mistakes comune)

- ❌ Folosirea `npm install` / `pnpm` — proiectul e pe **Bun** (`bun.lock`).
- ❌ Importarea `@/lib/sen/loader` într-o componentă client → crash la runtime.
- ❌ Adăugarea unei dependențe fără să fie necesară — preferă soluții cu ce există deja (Recharts, React Query, shadcn/ui, date-fns, lucide-react).
- ❌ Ștergerea/încălcarea `output: "standalone"` din `next.config.ts` — build-ul de producție depinde de el.
- ❌ Modificarea fișierelor din `src/components/ui/` (shadcn/ui) — dacă pare că trebuie modificate, problema e probabil în componenta dashboard care le folosește.
- ❌ Setarea `reactStrictMode` / `ignoreBuildErrors` / alte flag-uri de configurare „ca să dispară erorile" — repară codul, nu configul.
- ❌ Teste care depind de ordinea elementelor într-un `Map` — folosește chei sortate sau array-uri.

## 6. Workflow recomandat pentru modificări

1. Citește `src/lib/sen/` (tipuri + constante) înainte de a atinge componente.
2. Fă schimbarea cât mai mică și localizată.
3. Adaugă/actualizează teste unitare pentru orice logică nouă.
4. Rulează `bun run typecheck` + `bun test` + `bun run lint` + `bun run format:check`.
5. Verifică vizual în browser (inclusiv tema light și viewport mobil 390px) și consola fără erori.
6. Actualizează `CHANGELOG.md` dacă e o schimbare notabilă.

## 7. Workflow pentru verificarea cererilor de fix (ex: `TO_FIX.md`)

Când primești o listă de „găsiri" / „probleme posibile" (de exemplu fișierul `TO_FIX.md`), **nu presupune că sunt valide** și nu repara orbește. Urmează acest workflow:

1. **Citește integral lista de găsiri** înainte de orice modificare.
2. **Verifică fiecare găsire contra codului actual**: citește fișierele vizate, caută consumatorii (importuri, apeluri), confirmă comportamentul real (ex: rulează un test sau un script). Unele găsiri pot fi deja rezolvate sau invalide — **sari peste ele cu un motiv scurt**.
3. **Dacă o găsire implică o decizie de produs** (schimbă comportament vizibil, valori sau etichete), **întreabă utilizatorul** cu opțiuni clare înainte de a modifica (ex: „nuclearul e numărat în share-ul regenerabil — îl scoatem sau redenumim metrica?").
4. **Fă schimbări minime și localizate** — repară cauza, nu simptomul.
5. **Datele derivate se regenerează prin pipeline, nu manual**: după o modificare în `convert-sen.py`, rulează `bun run data:convert` (nu edita `data/*.json` de mână).
6. **Actualizează testele existente** și adaugă **teste de regresie** pentru comportamentul schimbat (ex: „nuclearul singur nu umflă share-ul regenerabil").
7. **Ține documentația la zi**: cifrele și etichetele modificate se reflectă în `docs/`, `README.md`, `AGENTS.md` și `CHANGELOG.md` (ex: numărul de teste, valorile KPI, `renewableShareAvg`).
8. **Rulează `bun run docs:mark-verified` + `bun run check` întreg** (format → docs → lint → typecheck → teste → build) — nu doar un subset.
9. **Curăță artefactele de build** (`.next`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, log-uri) și **oprește orice server** pornit pentru test.
10. **Marchează găsirile ca rezolvate** în fișierul sursă (ex: adaugă în `TO_FIX.md` antetul „✅ TOATE REZOLVATE") ca agenții viitori să nu re-aplice fix-uri vechi.
