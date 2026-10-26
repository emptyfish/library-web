#!/usr/bin/env bash
# Rebuilds src/data/spines.json (spine colors, sizes and order) from the shelf photos.
# macOS only: uses the built-in Vision text recognizer to read spine titles.
# Run from the repo root: scripts/spines/run.sh
set -euo pipefail
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q -r scripts/spines/requirements.txt
swiftc -O scripts/spines/ocr.swift -o "$WORK/ocr"

node -e "
const b = require('./data/books.json'); const out = {};
const fix = new Map(require('./src/data/shelf-corrections.json').moves.flatMap((m) => m.ids.map((id) => [id, m.to])));
for (const x of [...b].sort((a, b) => a._id - b._id))
  (out[fix.get(x._id) ?? x.shelf_id] ??= []).push({ id: x._id, title: x.title || '', author: x.author_name || '', pages: +x.gr_page_count || null, format: x.gr_format || '' });
require('fs').writeFileSync('$WORK/books.json', JSON.stringify(out));"

mkdir -p "$WORK/ocr-out"
for f in src/assets/shelves/*.jpg; do "$WORK/ocr" "$f" > "$WORK/ocr-out/$(basename "$f" .jpg).jsonl"; done

"$WORK/venv/bin/python" scripts/spines/extract.py src/assets/shelves "$WORK/books.json" "$WORK/ocr-out" src/data/spines.json ${PREVIEW_DIR:-}
