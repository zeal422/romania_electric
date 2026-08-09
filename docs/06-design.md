# 06 — Design & teme

> Vezi și: [05-ui-dashboard.md](./05-ui-dashboard.md) · [04-strat-date.md](./04-strat-date.md) (constantele surselor)

## Principii

- **Dark-first „control room"**: fundal charcoal adânc, accent emerald, fără albastru/indigo ca brand.
- **Culori semantice pe surse de energie** — fiecare sursă are o culoare care transmite intuitiv natura ei (cărbune = gri închis, gaz = portocaliu flacără, hidro = cyan, nuclear = lime, eolian = teal, solar = galben, biomasă = verde).
- **Consistență pe ambele teme** — aceleași culori de serie în light și dark.
- **Fără „AI slop"** — stilizare manuală, tooltip-uri custom, fără look „out of the box".

## Paleta temelor — `src/app/globals.css`

Temele sunt definite cu variabile CSS **oklch** (mai precise decât HSL) în `:root` (light) și `.dark`.

| Rol            | Light                                   | Dark                                   |
| -------------- | --------------------------------------- | -------------------------------------- |
| `--background` | `oklch(0.985 …)` alb cald               | `oklch(0.155 …)` charcoal adânc        |
| `--foreground` | gri foarte închis                       | `oklch(0.96 …)` aproape alb            |
| `--card`       | alb pur                                 | `oklch(0.2 …)`                         |
| `--primary`    | emerald `oklch(0.55 0.13 162)`          | emerald deschis `oklch(0.72 0.14 162)` |
| `--border`     | gri deschis                             | `oklch(0.28 … / 60%)`                  |
| `--chart-1..5` | emerald, cyan, lime, portocaliu, galben | aceleași, mai luminoase                |

Variabilele sunt expuse ca token-uri Tailwind prin `@theme inline` (`--color-background`, `--color-primary`, `--color-muted-foreground`, etc.) → se folosesc în clase ca `bg-background`, `text-muted-foreground`, `border-border`.

**Reguli pentru dezvoltatori:**

- Folosește **întotdeauna** variabilele Tailwind/semantice (`bg-card`, `text-muted-foreground`, `border-border`) — nu hex/oklch hardcodate pentru fundaluri și text.
- Singura excepție: culorile **seriilor de date** (hex în `constants.ts`, vezi mai jos) — astea sunt identice în ambele temi intenționat.
- Stiluri globale live în `@layer base` (body, scrollbar) și `@layer utilities` (`bg-aura-dark`/`bg-aura-light`, `.tnum`).

## Fundal „aura"

- `page.tsx` folosește `bg-aura-light dark:bg-aura-dark` — un gradient radial subtil în partea de sus, în locul unei grile (grila crea moiré/artefacte — a fost eliminată intenționat).
- Dark: aură rece charcoal; Light: aură verde-discret.

## Culorile surselor — `src/lib/sen/constants.ts`

| Sursă        | `kind`     | Culoare          | `fill` (aria)         |
| ------------ | ---------- | ---------------- | --------------------- |
| Cărbune      | fossil     | `#64748b` slate  | rgba(100,116,139,.65) |
| Hidrocarburi | fossil     | `#ea580c` orange | rgba(234,88,12,.65)   |
| Nuclear      | low-carbon | `#84cc16` lime   | rgba(132,204,22,.6)   |
| Ape          | renewable  | `#0891b2` cyan   | rgba(8,145,178,.6)    |
| Biomasă      | renewable  | `#16a34a` green  | rgba(22,163,74,.6)    |
| Eolian       | renewable  | `#14b8a6` teal   | rgba(20,184,166,.6)   |
| Foto         | renewable  | `#eab308` yellow | rgba(234,179,8,.6)    |

Serii non-sursă (`SERIES_COLORS`): `consum` roșu `#dc2626`, `productie` emerald `#059669`, `medieConsum` violet `#7c3aed`, `soldPositive` verde, `soldNegative` roșu.

> **Schimbă culorile DOAR în `constants.ts`.** Componentele citesc `SOURCES[f].color` / `SOURCES[f].fill` — nu le duplica în JSX.

## Tipografie

- Fonturi Next.js: **Geist Sans** (`--font-geist-sans`) + **Geist Mono** (`--font-geist-mono`), expuse ca `--font-sans`/`--font-mono`.
- Numerele din KPI-uri, tabele și tooltip-uri folosesc `font-mono tabular-nums` (cifre cu lățime egală, aliniere stabilă).
- `font-feature-settings: "tnum" 1, "cv11" 1` pe body (proportional-nums off).
- Ierarhie: h1 (header) semibold, h3 (secțiuni) `text-sm font-semibold`, etichete mici uppercase `tracking-wide text-muted-foreground`.

## Stilizarea grafice Recharts — `globals.css`

- `.recharts-default-tooltip` → border-radius custom (tooltip-ul e de fapt `ChartTooltip` propriu, vezi [05-ui-dashboard.md](./05-ui-dashboard.md)).
- Tick-urile axelor: `fill: var(--muted-foreground)`, 11px.
- Grid lines: `stroke: var(--border)`.
- Gradient-urile ariilor sunt definite în componente (`defs` + `linearGradient`), cu `fill` din `constants.ts`.

## Dark / Light toggle

- `next-themes` cu `attribute="class"`, `defaultTheme="dark"`, `enableSystem`.
- Clasa `.dark` pe `<html>` → variabilele `.dark` din CSS.
- Toggle: `ThemeToggle` cu `useMounted()` (detaliu în [05-ui-dashboard.md](./05-ui-dashboard.md)).

## Responsive

- Breakpoints Tailwind: 1 coloană sub `sm`, 2 la `sm`, 3–4 la `lg`.
- `max-w-[1400px]` container; padding `px-4 sm:px-6`.
- Tabel cu scroll `max-h-[28rem]`; header/butoane care se ascund pe mobil (`hidden sm:flex`, `hidden md:flex`).
