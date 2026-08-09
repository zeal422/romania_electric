#!/usr/bin/env bash
# Marchează toate documentele din docs/ ca fiind la zi cu codul: recalculează
# hash-ul sha256 al fiecărui fișier acoperit (din docs/.docs-manifest.json).
#
# Utilizare:
#   bun run docs:mark-verified
#
# Folosește-l DOAR după ce ai actualizat documentele ca să reflecte codul
# (vezi bun run docs:check). Altfel doar amâni detectarea stale-ului.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/docs/.docs-manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "✗ Nu există $MANIFEST." >&2
  exit 1
fi

python3 - "$ROOT" "$MANIFEST" <<'PY'
import hashlib
import json
import os
import sys
import tempfile

root, path = sys.argv[1], sys.argv[2]

def sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

with open(path, encoding="utf-8") as f:
    manifest = json.load(f)

for doc in manifest:
    covers = manifest[doc].get("covers") or {}
    for rel in covers:
        full = os.path.join(root, rel)
        covers[rel] = sha256(full) if os.path.exists(full) else ""

# Scriere atomică: temp în același director + os.replace, ca să nu rămână
# manifest trunchiat dacă procesul e întrerupt la jumătate.
fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
try:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp_path, path)
except BaseException:
    try:
        os.remove(tmp_path)
    except OSError:
        pass
    raise

print(f"✓ Marcate ca verificate: {len(manifest)} documente.")
PY
