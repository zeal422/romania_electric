#!/usr/bin/env bash
# Wrapper pentru `bun run dev` (Varianta A): aduce datele la zi dacă sunt vechi,
# exact ca workflow-urile GitHub în producție, apoi pornește serverul.
#
# Invariantul critic: un eșec al refresh-ului NU blochează pornirea serverului
# („warning, nu blocker"). `convert-sen.py --refresh-if-stale` iese întotdeauna
# cu exit 0 (prinde orice eroare intern), iar `if !` de mai jos e a doua plasă de
# siguranță — indiferent ce se întâmplă, `next dev` pornește.
#
# `set -e` e ACTIV (fail-fast) cu o singură excepție intenționată: pasul de
# refresh e în `if ! ... then` — o comandă condițională NU declanșează exit la
# eșec (verificat empiric), deci un refresh eșuat nu oprește pornirea. Orice altă
# eroare (ROOT, cd, PATH) oprește scriptul imediat, ca să nu pornească serverul
# dintr-o stare neașteptată (fix TO_FIX P2-003).
set -eu

# Autosuficient: nu ne bazăm pe PATH-ul moștenit de `bun run` (verificat empiric:
# în modul fișier, bun NU adaugă node_modules/.bin în PATH) — îl prependăm noi,
# ca `next` să se rezolve indiferent de mediul de rulare.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$ROOT/node_modules/.bin:$PATH"
cd "$ROOT"

# Refresh-ul scrie la stderr, deci nu poluează dev.log (care ia doar stdout-ul
# lui `next` prin `tee` de mai jos) — identic cu scriptul `dev` vechi.
if ! python3 scripts/convert-sen.py --refresh-if-stale; then
  echo "[dev] AVERTIZARE: refresh-ul datelor a eșuat — pornesc cu datele existente."
fi

# Identic cu scriptul `dev` original (pipeline-ul `tee dev.log` păstrat).
next dev -p 3000 2>&1 | tee dev.log
