# 00 — Index documentație

> **Punctul de intrare în documentația tehnică.** Acest fișier indexează toate documentele din `docs/`. Dacă ești agent AI sau dezvoltator nou, începe aici: găsești documentul potrivit în câteva secunde, apoi „harta de căutare" din [08](./08-harta-cautare.md) te duce direct la fișierul de cod.

Documentația e organizată pe zone, fiecare cu referințe exacte la fișierele sursă. Toate documentele sunt în română, ca și UI-ul aplicației.

## Cuprins

| #                           | Document                             | Ce acoperă                                                                              |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| [01](./01-arhitectura.md)   | **Arhitectura generală**             | Layerele proiectului, fluxul datelor end-to-end, deciziile cheie                        |
| [02](./02-pipeline-date.md) | **Pipeline-ul de date**              | `Grafic_SEN.xlsx` → `scripts/convert-sen.py` → `data/*.json` → loader                   |
| [03](./03-api.md)           | **API routes**                       | `/api/sen`, `/api/sen/summary`, `/api/sen/export` — parametri, răspunsuri, cache        |
| [04](./04-strat-date.md)    | **Stratul de date (`src/lib/sen/`)** | types, constants, aggregate, stats, format, loader — funcții și tipuri în detaliu       |
| [05](./05-ui-dashboard.md)  | **UI Dashboard**                     | `page.tsx`, componentele din `src/components/dashboard/` — ce randează fiecare          |
| [06](./06-design.md)        | **Design & teme**                    | Paleta dark-first „control room", culori surse, typografie, stilizare Recharts          |
| [07](./07-testing-ci.md)    | **Testare & CI**                     | Testele unitare, `bun run check`, check-ul de hidratare, verificarea că docs-ul e la zi |
| [08](./08-harta-cautare.md) | **Harta de căutare (LLM)**           | Index „întrebare → fișier" pentru navigare rapidă                                       |

## Cum se leagă documentele

```
AGENTS.md (reguli de lucru pentru agenți)
    │
    └──> docs/00-index.md  ← începe AICI
              │
              ├── 01-arhitectura.md  ──► leagă totul, punct de intrare
              ├── 02-pipeline-date.md ──► detaliu: date & conversie
              ├── 03-api.md           ──► detaliu: strat HTTP
              ├── 04-strat-date.md    ──► detaliu: logica pură de date
              ├── 05-ui-dashboard.md  ──► detaliu: componente React
              ├── 06-design.md        ──► detaliu: styling & teme
              ├── 07-testing-ci.md    ──► detaliu: verificări
              └── 08-harta-cautare.md ──► index invers (întrebare → fișier)

README.md (rădăcină) = document public pentru oameni
CHANGELOG.md          = istoricul modificărilor
```

## Cum navighezi rapid

- **Ești agent AI și cauți un fișier de cod?** → [08-harta-cautare.md](./08-harta-cautare.md) (întrebare → fișier).
- **Vrei imaginea de ansamblu?** → [01-arhitectura.md](./01-arhitectura.md).
- **Vrei să modifici ceva și nu știi unde?** → citește [AGENTS.md](../AGENTS.md) (reguli) + [08-harta-cautare.md](./08-harta-cautare.md).

## Menținerea documentației

- **Verificarea staleness**: `bun run check` include un pas care compară fiecare document cu fișierele sursă pe care le acoperă (manifest: `.docs-manifest.json`). Dacă un fișier sursă e modificat după ultima verificare, check-ul îți spune exact ce document trebuie actualizat. Detalii: [07-testing-ci.md](./07-testing-ci.md).
- **După ce actualizezi un document**, rulează `bun run docs:mark-verified` ca să marchezi că e la zi.
- **Dacă adaugi un document nou**, adaugă-i un rând în acest index (00) și în [08-harta-cautare.md](./08-harta-cautare.md).
- **Referințele la fișiere sunt relative** (ex: `src/lib/sen/aggregate.ts`) — păstrează-le astfel.
