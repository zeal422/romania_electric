#!/usr/bin/env bash
# Verifică dacă documentația (docs/*.md) e la zi cu codul.
#
# Mecanism: docs/.docs-manifest.json mapează fiecare document la fișierele
# sursă pe care le acoperă, împreună cu hash-ul sha256 al fiecărui fișier la
# momentul ultimei verificări. Dacă hash-ul curent al unui fișier acoperit
# diferă de cel din manifest (sau fișierul lipsește / nu are hash), documentul
# e considerat "stale" — cineva a modificat cod fără să actualizeze docs-ul.
#
# Folosim hash-uri, NU mtime: după git clone/checkout toate fișierele primesc
# mtime proaspăt, ceea ce ar produce false positive. Conținutul e verificabil.
#
# Utilizare:
#   bun run docs:check              # verifică (rulează automat în bun run check)
#   bun run docs:mark-verified      # recalculează hash-urile (după actualizarea docs)
#
# Ieșire: 0 = totul la zi; 1 = există documente stale (sau manifest lipsă).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/docs/.docs-manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "✗ Nu există $MANIFEST."
  echo "  Rulează: bun run docs:mark-verified  (creează manifestul)"
  exit 1
fi

# Căile din manifest sunt relative la rădăcina proiectului.
OUT="$(python3 - "$ROOT" "$MANIFEST" <<'PY'
import hashlib
import json
import os
import sys

root, manifest_path = sys.argv[1], sys.argv[2]
with open(manifest_path, encoding="utf-8") as f:
    manifest = json.load(f)

def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

stale: dict[str, list[str]] = {}
for doc, meta in manifest.items():
    msgs: list[str] = []
    for rel, stored_hash in (meta.get("covers") or {}).items():
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            msgs.append(f"fișier lipsește: {rel}")
        elif not stored_hash:
            msgs.append(f"nu are hash în manifest (rulează docs:mark-verified): {rel}")
        elif sha256(path) != stored_hash:
            msgs.append(f"modificat față de documentație: {rel}")
    if msgs:
        stale[doc] = msgs

for doc, msgs in stale.items():
    print(f"DOC|{doc}")
    for m in msgs:
        print(f"MSG|{m}")
PY
)"

if [ -n "$OUT" ]; then
  echo "⚠️  Documentație posibil stale — codul a fost modificat fără actualizarea documentației:"
  echo ""
  while IFS= read -r line; do
    case "$line" in
      DOC\|*) doc="${line#DOC|}"; echo "  • $doc" ;;
      MSG\|*) msg="${line#MSG|}"; echo "      - $msg" ;;
    esac
  done <<<"$OUT"
  echo ""
  echo "  Pași:"
  echo "    1. Actualizează documentul/documentele ca să reflecte codul."
  echo "    2. Rulează: bun run docs:mark-verified"
  echo ""
  echo "  Dacă modificarea e doar cosmetică (ex: comentariu), marchează și tu."
  exit 1
fi

echo "✓ Documentația e la zi cu codul."
exit 0
