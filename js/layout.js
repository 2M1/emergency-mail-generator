// Page layout of the alarm printout, ported from ../emergency_mail/src/printing/print_ems.rs.
// layout() makes every positioning decision and returns pages of draw operations in mm (origin top
// left, text y = baseline). render-svg.js and render-pdf.js only draw these operations, so the
// preview and the downloaded PDF can't drift apart.
import { view } from "./state.js";

export const PT = 0.35278; // mm per pt, as in emergency_mail
export const FONT_SIZE = 12; // pt
export const LINE_HEIGHT = (FONT_SIZE + 1) * PT; // mm
export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;

const MARGIN_X = 15;
const MARGIN_BOTTOM = 20;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN_X;
const MAX_Y = PAGE_HEIGHT - MARGIN_BOTTOM;
const SECTION_X = 15;
const LABEL_X = 18;
const VALUE_X = 50;
const COLUMN_GAP = 6;
const DETAILS_Y = 52;
const CONTINUATION_Y = 25;
const HEADER_TOP = 25;
const HEADER_HEIGHT = 15;
const HEADER_BOXES = [15, 50, 78, 103, 142, 195];
const LOGO = { x: 142, bottom: 41.5, size: 48 * PT };
const LINE_WIDTH = 1; // pt
const ROW_STEP = 1.5 * LINE_HEIGHT;

class PageWriter {
  constructor() {
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.ops = [];
    this.pages.push({ ops: this.ops });
  }

  text(x, y, text, { bold = false, field = null } = {}) {
    if (text) this.ops.push({ type: "text", x, y, text, bold, size: FONT_SIZE, field });
  }

  /** Draws one line per entry ({ text, field }) and returns the y below the last one. */
  lines(x, y, lines, { bold = false } = {}) {
    lines.forEach((line, i) => this.text(x, y + i * LINE_HEIGHT, line.text, { bold, field: line.field }));
    return y + lines.length * LINE_HEIGHT;
  }

  line(x1, y1, x2, y2) {
    this.ops.push({ type: "line", x1, y1, x2, y2, width: LINE_WIDTH });
  }

  rect(x, y, width, height) {
    this.ops.push({ type: "rect", x, y, width, height, lineWidth: LINE_WIDTH });
  }

  image(name, x, y, width, height) {
    this.ops.push({ type: "image", name, x, y, width, height });
  }
}

/**
 * Wraps text at word boundaries to maxWidth (mm). Explicit line breaks are kept; a word wider than
 * the line is split between characters.
 */
export function wrapText(text, maxWidth, measure, bold = false) {
  const result = [];
  for (const paragraph of String(text).split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      let rest = Array.from(word);
      while (rest.length > 1 && measure(rest.join(""), bold) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut).join(""), bold) > maxWidth) cut--;
        result.push(rest.slice(0, cut).join(""));
        rest = rest.slice(cut);
      }
      line = rest.join("");
    }
    result.push(line);
  }
  return result;
}

/** Removes trailing words until the text fits into maxWidth. The first word is always kept. */
export function fitToWidth(text, maxWidth, measure, bold = false) {
  let fitted = text;
  while (measure(fitted, bold) > maxWidth) {
    const cut = fitted.trimEnd().lastIndexOf(" ");
    if (cut <= 0) break;
    fitted = fitted.slice(0, cut).trimEnd();
  }
  return fitted;
}

/** Rows of the own organisation are printed bold (config: ownOrganisation). */
export function isOwnUnit(unit, ownOrganisation) {
  return Boolean(ownOrganisation) && (unit.station.includes(ownOrganisation) || unit.radioId.includes(ownOrganisation));
}

const headerDate = (date) => date.split("-").reverse().join(".");

function drawHeader(w, v, headerLines) {
  w.image("logo", LOGO.x, LOGO.bottom - LOGO.size, LOGO.size, LOGO.size);
  for (let i = 0; i < HEADER_BOXES.length - 1; i++) {
    w.rect(HEADER_BOXES[i], HEADER_TOP, HEADER_BOXES[i + 1] - HEADER_BOXES[i], HEADER_HEIGHT);
  }
  w.text(16, 34, "Einsatznummer:", { bold: true, field: "number" });
  w.text(52, 34, v.number, { field: "number" });
  w.text(80, 34, "Alarmzeit:", { bold: true, field: "alarmTime" });
  w.text(106, 32, headerDate(v.date), { field: "alarmDate" });
  w.text(106, 32 + LINE_HEIGHT, v.time, { field: "alarmTime" });
  headerLines.forEach((line, i) => w.text(160, 32 + i * LINE_HEIGHT, line, { bold: true }));
}

/**
 * One label/value row of the details section; rows without a value are skipped.
 * blockSpacing follows Rust's add_optional_ml_property (used for two-line labels and "Objekt:"):
 * the next row starts 5 mm below the longer of label and value instead of 1.2 lines below the value.
 */
function drawProperty(w, measure, y, label, values, { blockSpacing = false } = {}) {
  const lines = values
    .filter((value) => value.text)
    .flatMap((value) => wrapText(value.text, RIGHT_EDGE - VALUE_X, measure).map((text) => ({ text, field: value.field })));
  if (!lines.length) return y;
  const labelField = lines[0].field;
  const labelEnd = w.lines(LABEL_X, y, label.split("\n").map((text) => ({ text, field: labelField })), { bold: true });
  const valueEnd = w.lines(VALUE_X, y, lines);
  return blockSpacing ? Math.max(labelEnd, valueEnd) + 5 : valueEnd + 1.2 * LINE_HEIGHT;
}

function drawDetails(w, measure, v) {
  const { location: l, object: o, patient: p } = v;
  const town = [l.town, l.district !== l.town ? l.district : ""].filter(Boolean).join(" / ");
  const locality = l.locality !== l.district ? l.locality : "";
  const objectDetails = [o.part, o.number ? `Nr.: ${o.number}` : ""].filter(Boolean).join(", ");

  let y = DETAILS_Y;
  y = drawProperty(w, measure, y, "Stichwort:", [
    { text: v.keyword, field: "keyword" },
    { text: v.sondersignal, field: "blueLights" },
  ]);
  y = drawProperty(w, measure, y, "Einsatzort:", [
    { text: `${l.street} ${l.houseNumber}`.trim(), field: "location.street" },
    { text: town, field: "location.town" },
    { text: locality, field: "location.locality" },
  ]);
  y = drawProperty(w, measure, y, "Objekt:", [
    { text: o.name, field: "object.name" },
    { text: objectDetails, field: "object.part" },
  ], { blockSpacing: true });
  y = drawProperty(w, measure, y, "sonst.\nOrtsangaben:", [{ text: l.addition, field: "location.addition" }], { blockSpacing: true });
  y = drawProperty(w, measure, y, "FWPlan-Nr:", [{ text: o.fwPlan, field: "object.fwPlan" }]);
  y = drawProperty(w, measure, y, "Patient:", [{ text: `${p.firstName} ${p.lastName}`.trim(), field: "patient.firstName" }]);
  return y;
}

const fits = (y) => y + LINE_HEIGHT < MAX_Y;

function drawNote(w, measure, y, note) {
  w.text(SECTION_X, y, "Hinweise", { bold: true, field: "note" });
  y += 1.5 * LINE_HEIGHT;
  for (const line of wrapText(note, RIGHT_EDGE - LABEL_X, measure)) {
    if (!fits(y)) {
      w.addPage();
      y = CONTINUATION_Y;
    }
    w.text(LABEL_X, y, line, { field: "note" });
    y += LINE_HEIGHT;
  }
  w.line(MARGIN_X, y, RIGHT_EDGE, y);
  return y + 1.2 * LINE_HEIGHT;
}

const COLUMNS = [
  { label: "Funkrufname", key: "radioId", field: "radioId" },
  { label: "Wache", key: "station", field: "station" },
  { label: "Alarmzeit", key: "time", field: "alarmTime" },
  { label: "Einsatzmittel", key: "name", field: "name" },
];

/**
 * Column positions: each column starts after the widest entry of the previous one (header label
 * and all rows on all pages, bold rows measured bold) plus a gap, so continuation pages line up.
 */
export function tableColumns(rows, measure) {
  let x = LABEL_X;
  return COLUMNS.map((column) => {
    const width = Math.max(measure(column.label, true), ...rows.map((row) => measure(row[column.key], row.bold)));
    const placed = { ...column, x };
    x += width + COLUMN_GAP;
    return placed;
  });
}

function drawUnitTable(w, measure, y, units, ownOrganisation) {
  const rows = units.map((unit) => ({ ...unit, bold: isOwnUnit(unit, ownOrganisation) }));
  const columns = tableColumns(rows, measure);
  const nameX = columns[columns.length - 1].x;
  for (const row of rows) row.name = fitToWidth(row.name, RIGHT_EDGE - nameX, measure, row.bold);

  // Start on a new page when not even the header row and the first unit fit on this one.
  if (!fits(y + 2 * LINE_HEIGHT + (rows.length ? ROW_STEP : 0))) {
    w.addPage();
    y = CONTINUATION_Y;
  }
  w.text(SECTION_X, y, "Alarmierungen", { bold: true, field: "units" });
  y += 2 * LINE_HEIGHT;

  const drawHeaderRow = (headerY) => {
    for (const column of columns) w.text(column.x, headerY, column.label, { bold: true, field: "units" });
  };
  drawHeaderRow(y);
  let rowY = y + ROW_STEP;
  for (const row of rows) {
    if (!fits(rowY)) {
      w.addPage();
      drawHeaderRow(CONTINUATION_Y);
      rowY = CONTINUATION_Y + ROW_STEP;
    }
    for (const column of columns) {
      w.text(column.x, rowY, row[column.key], { bold: row.bold, field: `units.${row.index}.${column.field}` });
    }
    rowY += ROW_STEP;
  }
}

/**
 * @param state emergency (see state.js)
 * @param measure (text, bold) => width in mm at FONT_SIZE
 * @returns {{ title: string, pages: { ops: object[] }[] }}
 */
export function layout(state, measure, { headerLines = [], ownOrganisation = "" } = {}) {
  const v = view(state);
  const w = new PageWriter();

  drawHeader(w, v, headerLines);
  let y = drawDetails(w, measure, v);
  w.line(MARGIN_X, y, RIGHT_EDGE, y);
  y += 1.2 * LINE_HEIGHT;
  if (v.note) y = drawNote(w, measure, y, v.note);
  drawUnitTable(w, measure, y, v.units, ownOrganisation);

  const title = v.date && v.time ? `Einsatz am ${v.date} um ${v.time}:00` : "Einsatz";
  return { title, pages: w.pages };
}
