// Bootstrap: loads the data files and fonts, then connects state, form, preview and exports.
import { CONFIG } from "./config.js";
import { measureFromBytes } from "./fonts.js";
import { createForm } from "./form.js";
import { layout } from "./layout.js";
import { toMailText } from "./mail.js";
import { mailToEmergency, parseMail } from "./parse.js";
import { pageToSvg } from "./render-svg.js";
import { clearDraft, createEmergency, fileBaseName, loadDraft, missingFields, saveDraft } from "./state.js";

const $ = (id) => document.getElementById(id);

async function fetchOk(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
const fetchJson = async (url) => (await fetchOk(url, { cache: "no-cache" })).json();
const fetchBytes = async (url) => new Uint8Array(await (await fetchOk(url)).arrayBuffer());

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let toastTimer = 0;
function toast(message, duration = 6000) {
  const element = $("toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, duration);
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API (or without permission).
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

const PLAIN_TEXT_HINT = "Die E-Mail als reinen Text („Nur-Text“ / „Plain Text“) senden, nicht als HTML.";

function missingHint(state) {
  const missing = missingFields(state);
  return missing.length ? ` Noch leer: ${missing.join(", ")}.` : "";
}

function showFatal(error) {
  const offline = location.protocol === "file:";
  $("pages").innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal";
  box.innerHTML = offline
    ? "<strong>Die Seite muss über einen Webserver geöffnet werden.</strong><p>Lokal z. B. im Projektordner <code>python3 -m http.server</code> starten und <code>http://localhost:8000</code> öffnen.</p>"
    : "<strong>Stichworte, Fahrzeuge oder Schriften konnten nicht geladen werden.</strong><p>Bitte die Seite neu laden.</p>";
  const detail = document.createElement("p");
  detail.className = "hint";
  detail.textContent = String(error?.message ?? error);
  box.append(detail);
  $("pages").append(box);
}

async function main() {
  let loaded;
  try {
    const [keywordData, vehicleData, regular, bold, logo] = await Promise.all([
      fetchJson(CONFIG.dataUrls.keywords),
      fetchJson(CONFIG.dataUrls.vehicles),
      fetchBytes(CONFIG.fontUrls.regular),
      fetchBytes(CONFIG.fontUrls.bold),
      fetchBytes(CONFIG.logoUrl),
    ]);
    loaded = { keywords: keywordData.keywords, vehicles: vehicleData.vehicles, assets: { regular, bold, logo } };
  } catch (error) {
    console.error(error);
    showFatal(error);
    return;
  }

  const { keywords, vehicles, assets } = loaded;
  const measure = measureFromBytes(assets);
  const vehiclesById = new Map(vehicles.map((v) => [v.radioId, v]));
  const layoutOptions = { headerLines: CONFIG.headerLines, ownOrganisation: CONFIG.ownOrganisation };
  const storage = browserStorage();
  const newEmergency = () => createEmergency({ town: CONFIG.defaultTown });

  let state = loadDraft(storage, CONFIG.storageKey, newEmergency()) ?? newEmergency();
  let activeField = null;
  let renderFrame = 0;
  let saveTimer = 0;

  const pagesElement = $("pages");
  const renderedPages = [];

  function highlight() {
    for (const element of pagesElement.querySelectorAll("text.active")) element.classList.remove("active");
    if (!activeField) return;
    for (const element of pagesElement.querySelectorAll(`text[data-field="${CSS.escape(activeField)}"]`)) {
      element.classList.add("active");
    }
  }

  function render() {
    renderFrame = 0;
    const doc = layout(state, measure, layoutOptions);
    // Only pages whose markup changed are replaced, to keep the DOM work per keystroke small.
    doc.pages.forEach((page, i) => {
      const svg = pageToSvg(page, { logo: CONFIG.logoUrl }, `Seite ${i + 1} von ${doc.pages.length}`);
      if (renderedPages[i]?.svg === svg) return;
      let wrapper = renderedPages[i]?.wrapper;
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "page";
        pagesElement.append(wrapper);
      }
      wrapper.innerHTML = svg;
      renderedPages[i] = { svg, wrapper };
    });
    while (renderedPages.length > doc.pages.length) renderedPages.pop().wrapper.remove();
    highlight();

    $("mail-text").textContent = toMailText(state);
    const missing = missingFields(state);
    $("missing").hidden = missing.length === 0;
    $("missing").textContent = missing.length ? `Noch leer: ${missing.join(", ")}` : "";
  }

  function save() {
    saveTimer = 0;
    $("save-status").textContent = saveDraft(storage, CONFIG.storageKey, state)
      ? "Entwurf gespeichert"
      : "Entwurf kann in diesem Browser nicht gespeichert werden";
  }

  function setState(next) {
    state = next;
    form.sync(state);
    if (!renderFrame) renderFrame = requestAnimationFrame(render);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  const form = createForm({
    keywords,
    vehicles,
    getState: () => state,
    onChange: setState,
    onActiveField: (field) => {
      activeField = field;
      highlight();
    },
  });

  // Loading text is replaced by the pages.
  pagesElement.innerHTML = "";
  form.sync(state);
  render();
  if (!state.keyword) form.focusKeyword();

  pagesElement.addEventListener("click", (event) => {
    const field = event.target.closest("text[data-field]")?.dataset.field;
    if (field) form.focusField(field);
  });

  // ---------- exports ----------

  const pdfButton = $("download-pdf");
  pdfButton.addEventListener("click", async () => {
    pdfButton.disabled = true;
    pdfButton.setAttribute("aria-busy", "true");
    try {
      // Loaded on first use: pdf-lib is ~0.5 MB and not needed for the preview.
      const { renderPdf } = await import("./render-pdf.js");
      const bytes = await renderPdf(layout(state, measure, layoutOptions), assets);
      download(new Blob([bytes], { type: "application/pdf" }), `${fileBaseName(state)}.pdf`);
      toast(`PDF heruntergeladen.${missingHint(state)}`);
    } catch (error) {
      console.error(error);
      toast(`Das PDF konnte nicht erstellt werden: ${error.message}`);
    } finally {
      pdfButton.disabled = false;
      pdfButton.removeAttribute("aria-busy");
    }
  });

  $("download-mail").addEventListener("click", () => {
    download(new Blob([toMailText(state)], { type: "text/plain;charset=utf-8" }), `${fileBaseName(state)}.txt`);
    toast(`Mailtext heruntergeladen. ${PLAIN_TEXT_HINT}${missingHint(state)}`, 10_000);
  });

  $("copy-mail").addEventListener("click", async () => {
    const copied = await copyText(toMailText(state));
    toast(copied ? `Mailtext kopiert. ${PLAIN_TEXT_HINT}${missingHint(state)}` : "Kopieren nicht möglich. Bitte den Mailtext herunterladen.", 10_000);
  });

  for (const id of ["download-pdf", "download-mail", "copy-mail"]) $(id).disabled = false;

  // ---------- new emergency and import ----------

  $("new-emergency").addEventListener("click", () => {
    if (!window.confirm("Den aktuellen Einsatz verwerfen und einen neuen beginnen?")) return;
    clearDraft(storage, CONFIG.storageKey);
    setState(newEmergency());
    form.focusKeyword();
  });

  const dialog = $("import-dialog");
  const importText = $("import-text");
  const importError = $("import-error");

  $("open-import").addEventListener("click", () => {
    importText.value = "";
    importError.hidden = true;
    dialog.showModal();
    importText.focus();
  });

  $("import-form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "import") return;
    const text = importText.value;
    const parsed = parseMail(text);
    if (!Object.keys(parsed.fields).length && !parsed.alarms.length && !parsed.emList.length) {
      event.preventDefault();
      importError.textContent = "Im Text wurden keine Einsatzdaten (Zeilen wie ~~Ort~~…~~) gefunden.";
      importError.hidden = false;
      return;
    }
    setState(mailToEmergency(text, { vehiclesById, defaults: newEmergency() }));
    toast("Mail importiert.");
  });
}

main();
