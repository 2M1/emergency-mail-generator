# Emergency mail creator

A static website that creates an alarm printout (PDF) and the matching mail text in the Leitstelle's `~~Key~~Value~~` format, as read by [emergency_mail](../emergency_mail). The live preview on the left is the PDF; the form on the right edits it.

## Using it

1. Pick the **Stichwort** first. It sets Sondersignal and adds the keyword's default vehicles from `keywords.json`.
2. Fill in Einsatznummer, Alarmzeit, Einsatzort, Objekt, Patient and Hinweis. Clicking text in the preview jumps to its input.
3. Adjust the **Einsatzmittel**: add vehicles from `vehicles.json`, add other units (e.g. neighbouring stations) with Funkkenner and Wache, or give a unit its own alarm time. Units without their own time follow the emergency's alarm time.
4. **PDF herunterladen**, **Mailtext herunterladen** or **Kopieren** (mail text to the clipboard). Send the mail as **plain text** ("Nur-Text"), not HTML.

The current emergency is saved in the browser as a draft. **Neuer Einsatz** starts over, **Mail importieren** loads an existing mail text.

## Data

- `keywords.json`: Stichworte with Sondersignal default and default vehicles (radio IDs). `keyword` is the Alarmgrund exactly as the Leitstelle sends it (`B:Gebäude-Groß`, `H:VU Klemm`, `R1N1f`), `category` is `B`, `H` or `R`. Schema: `keywords.schema.json`.
- `vehicles.json`: radio IDs with name, Wache, category and crew. Schema: `vehicles.schema.json`.

The page loads both files at runtime, so changing them only needs a push. The pipeline checks them against the schemas and makes sure every radio ID in `keywords.json` exists in `vehicles.json`.

Department-specific settings (own organisation for bold rows, header text, default town) are in `js/config.js`.

## Development

No build step. Serve the repository root with any static web server:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Checks (Node 20 or newer):

```sh
npm run validate     # JSON schemas (ajv-cli, fetched by npx)
npm run check-data   # radio IDs in keywords.json exist in vehicles.json, no duplicates
npm test             # node --test: mail text, parser, state rules, layout, PDF
```

The browser libraries (pdf-lib, fontkit, pako) are vendored in `vendor/`; see [vendor/README.md](vendor/README.md). [PLAN.md](PLAN.md) describes the mail format, the PDF layout and the architecture.

## Deployment

`.github/workflows/pages.yml` runs the checks on every push and pull request and deploys `main` to GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
