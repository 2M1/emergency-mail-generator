# Implementation plan: Emergency mail creator

Reference plan for building the website described in [CLAUDE.md](CLAUDE.md). It is based on the data files in this repo, `sampledata/test.pdf`, and the sibling Rust project `../emergency_mail` (mail parser and PDF layout).

`../emergency_mail` is **reference only**. Do not modify it.

## Decisions

| Topic | Decision |
|---|---|
| Keyword spelling | "Klein"/"Groß" are capitalized, as in the Leitstelle's `B:Gebäude-Groß`. `keywords.json` is the source of truth and is written into the mail unchanged. |
| Keyword format | Each entry has an explicit `keyword` (the Alarmgrund exactly as sent) and a `category`: `B` and `H` use `B:…`/`H:…`, Rettungsdienst (`R`) uses codes without a colon (see [Rettungsdienst keywords](#rettungsdienst-keywords)). The schema checks that keyword and category fit. |
| Anonymisation | Test fixtures and docs only contain anonymised data: no real names, addresses, Einsatznummern, coordinates or symptoms. Real mails are anonymised before they are written anywhere. |
| PDF fidelity | Follow the Rust layout, but it doesn't have to be a 1:1 replica. Known Rust bugs are fixed (see [Deviations from the Rust PDF](#deviations-from-the-rust-pdf)). |
| Patient | Two input fields: Vorname and Nachname. |
| Coordinates | Left out for now: no form fields and no `WGS84_*`/`Koord_*` lines in the mail. |
| County codes | `vehicles.schema.json` allows radio IDs with 1–3 letter counties (`FL P …`, `FL PM …`, `FL BRB …`). |
| Hosting | Static files only (GitHub Pages). No server, no build step. |

### Rettungsdienst keywords

Format `R<RTWs>N<NEFs><suffix>`: the number of RTWs and of NEFs (emergency doctors) responding, plus an optional lowercase suffix.

| Keyword | Meaning |
|---|---|
| `R1N0` | Normal RTW emergency without a doctor. The fire department is only alarmed when no regular RTW is available in the region. |
| `R1N1f` | First Responder: possible resuscitation or unconscious patient. |
| `R1N1p` | Polytrauma from a severe mechanical injury mechanism. |

All R keywords default to Sondersignal and to `FL PM 01/85-01` (RTW FR Kleinmachnow).

### Open points

- Does `Flugzeugunfall` also take a hyphen at the Leitstelle (`H:Flugzeugunfall-Klein`)? Only `B:Gebäude-Groß` is confirmed by a real mail. `keywords.json` now has `H:Gefahrgut-Klein`/`-Groß` with a hyphen and `H:Flugzeugunfall Klein`/`Groß` with a space.

## Outputs

### 1. Mail text

The line format that `../emergency_mail/src/models/emergency_parsing.rs` reads: one `~~Key~~Value~~` entry per line, separated by `\n`, in this order:

| Key | Source | Format / empty value |
|---|---|---|
| `Ort` | location.town | |
| `Ortsteil` | location.district | |
| `Ortslage` | location.locality | |
| `Strasse` | location.street | |
| `Hausnummer` | location.houseNumber | |
| `Objekt` | object.name | empty allowed |
| `FWPlan` | object.fwPlan | empty allowed |
| `Objektteil` | object.part | empty allowed |
| `Objektnummer` | object.number | integer, `-1` when empty |
| `Einsatzart` | keyword category | `B` → `Brandeinsatz`, `H` → `Hilfeleistungseinsatz`, `R` → `Rettungseinsatz` |
| `Alarmgrund` | keyword | the `keyword` from `keywords.json`, e.g. `B:Gebäude-Groß` or `R1N1f` |
| `Sondersignal` | blueLights | `mit Sondersignal` / `ohne Sondersignal` |
| `Einsatznummer` | number | digits |
| `Besonderheiten` | note | newlines kept (the parser reads up to the next `~`) |
| `Name` | patient | `Nachname,Vorname`, `,` when empty |
| `EMListe` | units | radio IDs sorted alphabetically, joined with `, ` |
| `Status` | fixed | `~~Status~~Tableau-Adresse~~Wache~~Fahrzeug~~Alarmiert~~Ausgerückt~~` |
| `ALARM` | one line per unit, in unit-list order | `~~ALARM~~unbekannt#~~<Wache>ø~~<Funkkenner>~~<HH:MM>~~~~` |
| `Einsatzortzusatz` | location.addition | empty allowed |
| `Alarmzeit` | alarmTime | `dd.mm.yy&HH:MM` |

- With no units, write a single empty row, `~~ALARM~~#~~ø~~~~~~`, as real mails do (`../emergency_mail/examples/emergency_obj.txt`).
- Units without a radio ID (a row still being typed) are left out of the mail and the PDF.
- Real Rettungsdienst mails (`tests/fixtures/emergency_r1n1f.txt`, anonymised) differ in three ways the importer handles:
  - The ALARM table can contain `FR Kleinmachnow`. That is the fire department's name in the EMS dispatch, not a radio ID; the vehicle itself is `FL PM 01/85-01`, and its Wache stays `PM FW Kleinmachnow`.
  - A unit can have an empty alarm time. The importer treats it as "follows the emergency time".
  - EMListe can list only some of the units. The generator still writes every unit into both EMListe and ALARM, as `CLAUDE.md` requires.
- The trailing `ø` after the Wache and `unbekannt#` in the first column copy the real Leitstelle format. The Rust parser strips the `ø`.
- A unit's ALARM time is its own override if set, otherwise the emergency's alarm time (`HH:MM`).
- `~` is removed from every input value because it is the field delimiter.
- Also add a hint to the user when downloading the generated Mail text that the e-mail has to be sent as "Text-only" or "plain text".

Example:

```
~~Ort~~Kleinmachnow~~
~~Ortsteil~~~~
~~Ortslage~~~~
~~Strasse~~Am Bannwald~~
~~Hausnummer~~1~~
~~Objekt~~Feuerwache Kleinmachnow~~
~~FWPlan~~0101000~~
~~Objektteil~~~~
~~Objektnummer~~1~~
~~Einsatzart~~Brandeinsatz~~
~~Alarmgrund~~B:Gebäude-Groß~~
~~Sondersignal~~mit Sondersignal~~
~~Einsatznummer~~12341234~~
~~Besonderheiten~~Flammen weit sichtbar. Personen unklar.~~
~~Name~~Mustermann,Max~~
~~EMListe~~FL PM 01/11-01, FL PM 01/44-01~~
~~Status~~Tableau-Adresse~~Wache~~Fahrzeug~~Alarmiert~~Ausgerückt~~
~~ALARM~~unbekannt#~~PM FW Kleinmachnowø~~FL PM 01/44-01~~19:10~~~~
~~ALARM~~unbekannt#~~PM FW Kleinmachnowø~~FL PM 01/11-01~~19:12~~~~
~~Einsatzortzusatz~~Hydrant H100 an der Einfahrt~~
~~Alarmzeit~~08.07.26&19:10~~
```

### 2. PDF

A port of `../emergency_mail/src/printing/print_ems.rs`. `sampledata/test.pdf` is the visual target.

All measurements below are in mm, with the origin at the top left. Text `y` values are baselines. pdf-lib's origin is bottom left, so the PDF renderer converts `y' = 297 − y`.

**Page and fonts**
- A4 (210 × 297). Side margins 15, bottom margin 20.
- PT Serif Regular and Bold (`resources/`), 12 pt.
- Line height `LH` = 13 pt = 4.586 mm (1 pt = 0.35278 mm).
- Lines are 1 pt thick.

**Header** (boxes from y 25 to 40)
- Box edges at x = 15 | 50 | 78 | 103 | 142 | 195.
- `Einsatznummer:` (bold) at (16, 34); the number at (52, 34).
- `Alarmzeit:` (bold) at (80, 34); `dd.mm.yyyy` / `HH:MM` on two lines at (106, 32).
- Logo (`resources/logo-sw.png`) at the left of the last box. Calibrate its size against test.pdf.
- `Feuerwehr` / `Kleinmachnow` (bold) on two lines at (160, 32).

**Details** (start at y = 52; labels bold at x = 18, values at x = 50; rows with empty values are skipped)
1. `Stichwort:` keyword on the first line, Sondersignal text on the second.
2. `Einsatzort:` `Strasse Hausnummer` / `Ort[ / Ortsteil]` / `[Ortslage]`.
3. `Objekt:` object name / `[Objektteil][, ]Nr.: <n>`.
4. `sonst.` / `Ortsangaben:` (label on two lines): Einsatzortzusatz.
5. `FWPlan-Nr:` plan number.
6. `Patient:` `Vorname Nachname`.

After a single-line label: `y = end of value + 1.2·LH`. After a two-line label (Objekt, sonst. Ortsangaben): `y = max(end of label, end of value) + 5`.

**Divider** after the details, always (as in Rust): from x 15 to 195 at y, then `y += 1.2·LH`.

**Hinweise** (only when the note is not empty)
- `Hinweise` (bold) at x = 15, then `y += 1.5·LH`.
- Note text at x = 18, wrapped.
- Divider, then `y += 1.2·LH`.

**Alarmierungen table**
- `Alarmierungen` (bold) at x = 15, then `y += 2·LH`.
- Header row (bold): `Funkrufname` at x = 18, then `Wache`, `Alarmzeit`, `Einsatzmittel`.
- Column x positions: each column starts at the previous one's x + the width of its widest entry + 6. Widths are measured over the header label and all rows on all pages, using bold widths for bold rows.
- Rows start 1.5·LH below the header row and are spaced 1.5·LH apart.
- A row is bold when its Wache contains the own organisation name (`Kleinmachnow`, configurable).
- `Einsatzmittel` is the vehicle name from `vehicles.json`. When it's wider than the space up to x = 195, drop whole words from the end, always keeping the first word. Units not in `vehicles.json` show an empty name unless one was typed in.
- Rows go on page 1 while `y + LH < 297 − 20`. The rest continue on page 2 starting at y = 25, with the header row repeated.

**Metadata and file names**
- PDF title: `Einsatz am YYYY-MM-DD um HH:MM:00`.
- Downloads: `YYYY-MM-DD_HH-MM_<Stichwort>.pdf` and the same name with `.txt` for the mail text. Characters Windows forbids in file names (`\ / : * ? " < > |`, e.g. in `B:Wald Groß/WSP`) become `-`.
- Fonts are embedded without subsetting: pdf-lib's subsetting drops glyph outlines of PT Serif Regular. The PDF is about 290 KB.
- The logo is 48 × 48 pt (16.93 mm) at x = 142, bottom edge at y = 41.5, measured in test.pdf.

#### Deviations from the Rust PDF

- `Ort / Ortsteil` only when the Ortsteil is not empty and differs from the Ort. Rust prints `Kleinmachnow /` when it's empty.
- Long text wraps at word boundaries using the measured text width. Rust splits every 80 characters, even mid-word.
- No leading space before the patient name.
- The table header row is repeated on page 2.
- A long note or unit list continues on as many pages as needed (Rust assumes everything fits on two pages). If not even the table header and one row fit on the current page, the table starts on the next one.

## Architecture

Plain ES modules with no framework and no build step. Libraries are copied into `vendor/` at pinned versions, so the site doesn't depend on a CDN:

- `pdf-lib` 1.17.1: PDF creation (loaded on the first PDF download)
- `@pdf-lib/fontkit` 1.1.1: embedding and measuring PT Serif (umlauts)
- `pako` 2.1.0: fontkit's only dependency. fontkit's `import "pako"` is rewritten to the vendored file, because browsers can't resolve bare imports ([vendor/README.md](vendor/README.md), `scripts/vendor.sh`).

One layout engine feeds two renderers, so the preview and the download can't drift apart:

```
state ──► mail.js    toMailText(state)       → string
      └─► layout.js  layout(state, measure)  → pages[] of draw ops (text / line / rect / image, in mm)
                        ├─► render-svg.js  → live preview (left column)
                        └─► render-pdf.js  → pdf-lib bytes (download)
```

- **One source of positions:** `layout.js` makes every positioning decision (wrapping, column widths, page break). The renderers only draw the ops.
- **One source of values:** `view(state)` in `state.js` cleans every value once (removes `~`, trims, resolves unit times). Both `mail.js` and `layout.js` read from it, so the mail and the PDF can't show different data.
- **Same text widths everywhere:** `measure(text, bold)` uses the embedded PT Serif metrics (`font.widthOfTextAtSize`). The SVG preview loads the same TTF files via `@font-face`.
- **Click to edit:** every text op carries a `field` tag (e.g. `note`, `units[3].alarmTime`). Clicking text in the preview focuses the matching input.
- **Why not show the PDF itself:** re-rendering the PDF in an iframe or with pdf.js flickers, loses zoom and adds ~1 MB. The SVG preview updates on every keystroke.
- **Testable in Node:** `mail.js`, `layout.js` and `state.js` are pure and run under `node --test`.

### Files

```
index.html
css/app.css
js/config.js       own organisation name, header text, default town, logo path
js/main.js         bootstrap: fetch keywords.json + vehicles.json, load fonts, wire events
js/state.js        data model, defaults, keyword switching, unit time rules, view(), localStorage draft
js/mail.js         toMailText(state)
js/parse.js        mail text → emergency (port of the Rust parser; import and round-trip tests)
js/layout.js       layout(state, measure) → pages of draw ops
js/fonts.js        fontkit, measure()
js/render-svg.js   draw ops → SVG
js/render-pdf.js   draw ops → PDF bytes
js/form.js         right-hand form
js/combobox.js     searchable picker for Stichwort and vehicles
vendor/            pdf-lib, fontkit, pako
scripts/check-data.mjs   cross-checks the data files (see Pipeline)
scripts/vendor.sh        downloads the pinned libraries into vendor/
tests/             node --test, fixtures in tests/fixtures/ (sampledata/ is gitignored)
package.json       dev/test tools only; not needed for hosting
.github/workflows/pages.yml
```

### Data model

```js
{
  keyword: "B:Gebäude-Groß",          // `keyword` from keywords.json, e.g. also "R1N1f"
  blueLights: true,
  number: "12341234",
  alarmTime: "2026-07-08T19:10",      // local time, minute precision
  location: { town, district, locality, street, houseNumber, addition },
  object: { name, part, number, fwPlan },
  patient: { firstName, lastName },
  note: "",
  units: [
    { radioId, station, name,          // name/station prefilled from vehicles.json, free for custom units
      alarmTime: null,                 // null = follow the emergency time, else "HH:MM"
      source: "keyword" | "manual",
      touched: false }                 // set when the user edits a keyword-added unit
  ]
}
```

### Behavior rules

- **New emergency:** the Stichwort picker comes first and has focus. The alarm time defaults to now, the Ort to `defaultTown` from `config.js`.
- **Selecting a keyword:**
  - Sets `blueLights` to the keyword's default.
  - Removes units with `source: "keyword"` and `touched: false`, unless the new keyword lists them too (those stay in place).
  - Appends the new keyword's default vehicles that aren't already in the list.
  - Manual and edited units stay.
  - Focus moves on to Einsatznummer while it's empty.
- **Unit times:** changing the emergency's alarm time moves every unit whose `alarmTime` is `null`. A reset button next to an overridden time sets it back to `null`.
- **Adding units:**
  - From `vehicles.json`: searchable, grouped by `category`.
  - Or custom: Funkkenner + Wache (+ optional name). This is needed for neighbouring units like `FL PM 03/44-01` or `RT PM 03/83-01`.
- **EMListe** is always derived from the unit list. It isn't printed but is always in the mail.
- **Draft:** autosaved to `localStorage`, wrapped in try/catch so the page still works when storage is unavailable. "Neuer Einsatz" resets it.

## UI

- **Top bar:** title on the left. On the right: `PDF herunterladen`, `Mailtext herunterladen`, `Kopieren` (mail text to clipboard). No `mailto:` link, because a long unit list exceeds URL length limits.
- **Left column (~⅔):** A4 pages scaled to the column width, stacked vertically, always visible.
- **Right column (~⅓), in this order:**
  1. Stichwort (searchable, shows the `example` text) and Sondersignal toggle
  2. Einsatznummer, Alarmzeit (date + time)
  3. Einsatzort: Straße, Hausnummer, Ort, Ortsteil, Ortslage, Einsatzortzusatz
  4. Objekt: Name, Objektteil, Objektnummer, FWPlan-Nr
  5. Patient: Vorname, Nachname
  6. Hinweis (textarea)
  7. Einsatzmittel: one row per unit with Funkkenner, name, Wache, time (placeholder = emergency time, reset button) and remove; below the list, add from `vehicles.json` or add a custom unit
- **Narrow screens:** the columns stack, with the form first and the preview below.

## Pipeline

`.github/workflows/pages.yml` runs steps 1–3 on every push and pull request, and step 4 only for `main`:

1. Validate `vehicles.json` and `keywords.json` against their schemas (`npm run validate`: `ajv-cli`, draft 2020-12; the keywords schema references the vehicles schema).
2. Run `scripts/check-data.mjs` (`npm run check-data`), which checks what the schemas can't: every radio ID in `keywords.json` exists in `vehicles.json`, and no radio ID or keyword appears twice.
3. `npm test` (`node --test`).
4. Copy the site files into `_site` and deploy them with `actions/upload-pages-artifact` + `actions/deploy-pages`. The repository's Pages source must be set to "GitHub Actions".

The JSON files are fetched when the page loads, so changing them only needs a push.

## Phases

All phases are implemented.

1. **Setup**
   - [x] `index.html` with the two-column layout and top bar, `css/app.css`
   - [x] Vendor pdf-lib + fontkit
   - [x] Load `keywords.json` / `vehicles.json`
   - [x] Pages workflow with schema validation and `check-data.mjs`
2. **Mail text**
   - [x] `state.js`: data model, keyword switching, unit time rules
   - [x] `mail.js`
   - [x] Tests: output compared to fixture mails, keyword switching, time inheritance, `~` removal, empty unit list
3. **PDF**
   - [x] `fonts.js`, `layout.js`, `render-pdf.js`
   - [x] Calibrate: rebuild the data behind `test.pdf` (`tests/fixtures/test-pdf.json`), render both with `pdftoppm` and compare. Every word is within 0.05 pt of test.pdf, apart from the deliberate fixes.
   - [x] Tests: column widths, name shortening, page break with many units
4. **Preview + form**
   - [x] `render-svg.js`, `form.js`, live updates
   - [x] Unit list with add, remove and time override
   - [x] Download and copy buttons
5. **Polish**
   - [x] Click-to-edit in the preview (and the focused input is highlighted in the preview)
   - [x] `localStorage` draft, "Neuer Einsatz"
   - [x] Mobile layout
   - [x] Optional: import a pasted mail text (port of the Rust parser) to edit existing alarms

## Verification

- `node --test` for everything pure (mail text, state rules, layout).
- Visual comparison with `sampledata/test.pdf` (rasterize with `pdftoppm`) for layout changes.
- Manual check: `python3 -m http.server` in the repo root and click through, including a unit list long enough to reach page 2 (`sampledata/emergency_many_units.txt` has one).

## References

- `../emergency_mail/src/printing/print_ems.rs`: PDF layout
- `../emergency_mail/src/printing/pdf/page.rs`: line height, margins, text drawing
- `../emergency_mail/src/models/emergency_parsing.rs`: mail format as the parser reads it
- `../emergency_mail/src/models/emergency.rs`: address, object and patient formatting
- `sampledata/test.pdf`, `sampledata/emergency_simple.txt`, `sampledata/emergency_many_units.txt`: sample output and mails (gitignored, copy what tests need into `tests/fixtures/`)
- `sampledata/Stichworte_B_THL_V7.1.md`: keyword catalog
- `sampledata/FahrzeugeKleinmachnow.md`: vehicle list
