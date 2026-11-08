#!/usr/bin/env bash
# Fetch the exact pinned third-party files the FORGE page loads, from npm (free, public),
# into DIR for bench.mjs. Prints sha256 so CI can compare with the live CDN copies.
set -euo pipefail
DIR="${1:?usage: fetch_vendor.sh DIR}"
mkdir -p "$DIR"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
( cd "$TMP"
  for p in @google/model-viewer@4.1.0 html5-qrcode@2.3.8 axe-core@4.10.2; do npm pack "$p" --silent >/dev/null; done
  for t in *.tgz; do mkdir -p "${t%.tgz}"; tar xzf "$t" -C "${t%.tgz}" --strip-components=1; done )
cp "$TMP/google-model-viewer-4.1.0/dist/model-viewer.min.js" "$DIR/"
cp "$TMP/html5-qrcode-2.3.8/html5-qrcode.min.js" "$DIR/"
cp "$TMP/axe-core-4.10.2/axe.min.js" "$DIR/"
( cd "$DIR" && sha256sum model-viewer.min.js html5-qrcode.min.js axe.min.js )
