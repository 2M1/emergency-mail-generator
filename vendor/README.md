# Vendored libraries

Copied from the npm registry by [`scripts/vendor.sh`](../scripts/vendor.sh), which pins the versions and checks the tarball checksums. They're served as static files, so the site doesn't depend on a CDN.

| File | Package | License |
|---|---|---|
| `pdf-lib.esm.min.js` | [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1, `dist/pdf-lib.esm.min.js` | MIT, [`pdf-lib.LICENSE.md`](pdf-lib.LICENSE.md) |
| `fontkit.es.min.js` | [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1, `dist/fontkit.es.min.js` | MIT (per its `package.json`, the package ships no license file) |
| `pako.esm.js` | [pako](https://github.com/nodeca/pako) 2.1.0, `dist/pako.esm.mjs` | MIT, [`pako.LICENSE`](pako.LICENSE) |

The only modification: fontkit's `import e from"pako"` is rewritten to `import e from"./pako.esm.js"`, because browsers can't resolve bare module specifiers without an import map. fontkit only uses `pako.inflate` (for WOFF fonts), which pako 2 still provides.

To update, change the URLs and checksums in `scripts/vendor.sh` and run it from the repository root.
