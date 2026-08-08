#!/usr/bin/env bash
# CI check: detectează erorile de hidratare React încărcând aplicația într-un
# browser headless (agent-browser) și scanând console.error / page errors
# după tipare specifice mismatch-ului de hidratare.
#
# Utilizare:
#   bun run check:hydration                 # http://localhost:3000
#   ./scripts/check-hydration.sh http://... # URL custom
#
# Ieșire: 0 = curat, 1 = s-au găsit erori de hidratare.
# Necesită: serverul de dev pornit pe portul 3000 (sau URL-ul dat) + agent-browser instalat.
set -uo pipefail

URL="${1:-http://localhost:3000}"
HYDRATION_PATTERNS="hydrated but some attributes|did not match|hydration mismatch|didn't match the client|Hydration failed|Text content does not match|Error: Hydration"

echo "→ Verific erori de hidratare la: $URL"

# Deschide pagina
if ! agent-browser open "$URL" >/dev/null 2>&1; then
  echo "✗ Nu am putut deschide $URL cu agent-browser."
  echo "  Verifică că serverul rulează și că agent-browser este instalat (agent-browser install)."
  exit 2
fi

# Așteaptă ca rețeaua să se liniștească și React să hidrateze
agent-browser wait --load networkidle >/dev/null 2>&1 || true
sleep 2

# Capturează console + page errors
CONSOLE_OUT="$(agent-browser console 2>&1 || true)"
ERRORS_OUT="$(agent-browser errors 2>&1 || true)"

# Închide browser-ul indiferent de rezultat
agent-browser close >/dev/null 2>&1 || true

# Verifică tiparele de hidratare
FAIL=0
if echo "$CONSOLE_OUT" | grep -iqE "$HYDRATION_PATTERNS"; then
  echo "✗ Erori de hidratare detectate în console:"
  echo "$CONSOLE_OUT" | grep -iE "$HYDRATION_PATTERNS" | head -20
  FAIL=1
fi

if echo "$ERRORS_OUT" | grep -iqE "$HYDRATION_PATTERNS"; then
  echo "✗ Erori de hidratare detectate în page errors:"
  echo "$ERRORS_OUT" | grep -iE "$HYDRATION_PATTERNS" | head -20
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ Nicio eroare de hidratare detectată."
  exit 0
else
  echo ""
  echo "Tip: mismatch-urile de hidratare apar când o componentă client"
  echo "randează output diferit pe server vs client. Cauze frecvente:"
  echo "  - useTheme()/next-themes (resolvedTheme e undefined pe server)"
  echo "  - Date.now() / Math.random() în render"
  echo "  - toLocaleString() cu locale ce diferă între Node ICU și browser"
  echo "Vezi: https://react.dev/link/hydration-mismatch"
  exit 1
fi
