#!/bin/sh
# Downloads the pinned browser libraries from the npm registry into vendor/.
# Run from the repository root: sh scripts/vendor.sh
#
# fontkit's ES build imports the bare specifier "pako", which browsers cannot
# resolve without an import map. The import is rewritten to the vendored pako
# ES module; nothing else is changed.
set -eu

VENDOR_DIR="vendor"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fetch() {
  # $1 tarball URL, $2 expected sha256, $3 target name
  curl -sSfL -o "$TMP_DIR/$3.tgz" "$1"
  echo "$2  $TMP_DIR/$3.tgz" | shasum -a 256 -c - >/dev/null
  mkdir -p "$TMP_DIR/$3"
  tar xzf "$TMP_DIR/$3.tgz" -C "$TMP_DIR/$3"
}

fetch https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz \
  a7cc1eaf12e41e612a7be581162a63b18118aefc01e90f6a1f35347b1f324a1c pdf-lib
fetch https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz \
  6dd0ae9209fce419b2ed76c97166863167b4df56d75fbe3c7f1d1e6e49c85867 fontkit
fetch https://registry.npmjs.org/pako/-/pako-2.1.0.tgz \
  49fedc8866b4abfc8e71dc7fe75ad4ef1ff1ac9601b0642cff88ee5bf2338709 pako

mkdir -p "$VENDOR_DIR"
cp "$TMP_DIR/pdf-lib/package/dist/pdf-lib.esm.min.js" "$VENDOR_DIR/pdf-lib.esm.min.js"
cp "$TMP_DIR/pdf-lib/package/LICENSE.md" "$VENDOR_DIR/pdf-lib.LICENSE.md"
cp "$TMP_DIR/pako/package/dist/pako.esm.mjs" "$VENDOR_DIR/pako.esm.js"
cp "$TMP_DIR/pako/package/LICENSE" "$VENDOR_DIR/pako.LICENSE"
sed 's#import e from"pako";#import e from"./pako.esm.js";#' \
  "$TMP_DIR/fontkit/package/dist/fontkit.es.min.js" > "$VENDOR_DIR/fontkit.es.min.js"

grep -q 'from"./pako.esm.js"' "$VENDOR_DIR/fontkit.es.min.js" || {
  echo "patching the pako import in fontkit failed" >&2
  exit 1
}
echo "vendor/ updated"
