import assert from "node:assert/strict";
import { test } from "node:test";
import { fitToWidth, layout, LINE_HEIGHT, wrapText } from "../js/layout.js";
import { mailToEmergency } from "../js/parse.js";
import { createEmergency } from "../js/state.js";
import { fixture, fixtureJson, LAYOUT_OPTIONS, measure, vehiclesById } from "./helpers.js";

const MAX_Y = 297 - 20;
const texts = (page) => page.ops.filter((op) => op.type === "text");
const find = (page, text) => texts(page).find((op) => op.text === text);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.02, `${message}: ${actual} ≠ ${expected}`);

test("the test.pdf emergency is laid out like the Rust printout", () => {
  const { pages, title } = layout(fixtureJson("test-pdf.json"), measure, LAYOUT_OPTIONS);
  assert.equal(pages.length, 1);
  assert.equal(title, "Einsatz am 2026-07-08 um 19:10:00");
  const page = pages[0];

  // Baselines and x positions measured in sampledata/test.pdf.
  const expected = [
    ["Stichwort:", 18, 52],
    ["Einsatzort:", 18, 66.676],
    ["Objekt:", 18, 81.351],
    ["sonst.", 18, 95.524],
    ["Ortsangaben:", 18, 100.11],
    ["FWPlan-Nr:", 18, 109.696],
    ["Patient:", 18, 119.785],
    ["Hinweise", 15, 135.378],
    ["Alarmierungen", 15, 152.347],
    ["Funkrufname", 18, 161.519],
    ["Wache", 55.395, 161.519],
    ["Alarmzeit", 110.578, 161.519],
    ["Einsatzmittel", 136.716, 161.519],
    ["GWF Kleinmachnow", 136.716, 175.278],
    ["RT PM 03/83-01", 18, 271.587],
  ];
  for (const [text, x, y] of expected) {
    const op = find(page, text);
    assert.ok(op, `missing "${text}"`);
    near(op.x, x, `${text} x`);
    near(op.y, y, `${text} y`);
  }
  near(find(page, "Flammen weit sichtbar. Personen unklar.").y, 142.257, "note y");

  assert.equal(find(page, "FL PM 01/01-01").bold, true, "own units are bold");
  assert.equal(find(page, "FL PM 03/44-01").bold, false, "other units are regular");
});

test("the Rust quirks are fixed: no dangling 'Ort /' and no leading space before the patient", () => {
  const page = layout(fixtureJson("test-pdf.json"), measure, LAYOUT_OPTIONS).pages[0];
  assert.ok(find(page, "Kleinmachnow"), "town without ' /'");
  assert.ok(find(page, "Max Mustermann"), "patient without leading space");
  assert.equal(find(page, "Max Mustermann").x, 50);
});

test("Ort / Ortsteil and Ortslage follow the Rust rules otherwise", () => {
  const base = fixtureJson("test-pdf.json");
  const with_ = (location) => layout({ ...base, location: { ...base.location, ...location } }, measure, LAYOUT_OPTIONS).pages[0];
  assert.ok(find(with_({ district: "Dreilinden" }), "Kleinmachnow / Dreilinden"));
  assert.ok(find(with_({ district: "Kleinmachnow" }), "Kleinmachnow"));
  assert.ok(find(with_({ district: "Dreilinden", locality: "Zentrum" }), "Zentrum"));
  assert.equal(find(with_({ district: "Zentrum", locality: "Zentrum" }), "Zentrum"), undefined);
});

test("rows without values are skipped, the note section only appears with a note", () => {
  const state = { ...createEmergency({ now: new Date(2026, 6, 8, 19, 10) }), keyword: "B:Klein" };
  const page = layout(state, measure, LAYOUT_OPTIONS).pages[0];
  for (const label of ["Einsatzort:", "Objekt:", "sonst.", "FWPlan-Nr:", "Patient:", "Hinweise"]) {
    assert.equal(find(page, label), undefined, label);
  }
  assert.ok(find(page, "Stichwort:"));
  assert.ok(find(page, "Funkrufname"), "the table header is shown without units");
});

test("the object row combines Objektteil and number", () => {
  const base = fixtureJson("test-pdf.json");
  const page = layout({ ...base, object: { ...base.object, part: "Garagen", number: "20" } }, measure, LAYOUT_OPTIONS).pages[0];
  assert.ok(find(page, "Garagen, Nr.: 20"));
});

test("unit names are shortened by whole words to fit the page", () => {
  const base = fixtureJson("test-pdf.json");
  const units = [{ ...base.units[1], name: "Einsatzleitwagen mit sehr langer Bezeichnung und noch mehr Wörtern Kleinmachnow" }];
  const page = layout({ ...base, units }, measure, LAYOUT_OPTIONS).pages[0];
  const header = find(page, "Einsatzmittel");
  const name = texts(page).find((op) => op.field === "units.0.name");
  assert.ok(name.text.startsWith("Einsatzleitwagen mit"));
  assert.ok(name.text.length < units[0].name.length);
  assert.ok(header.x + measure(name.text, true) <= 195);
  assert.equal(fitToWidth("Einsatzleitwagen", 1, measure), "Einsatzleitwagen", "the first word is kept");
});

test("a long unit list continues on page 2 with the header row repeated", () => {
  const state = mailToEmergency(fixture("emergency_many_units.txt"), { vehiclesById });
  const { pages } = layout(state, measure, LAYOUT_OPTIONS);
  assert.equal(pages.length, 2);

  const rowOps = pages.flatMap((page, p) => texts(page).filter((op) => /^units\.\d+\.radioId$/.test(op.field ?? "")).map((op) => ({ ...op, p })));
  assert.equal(rowOps.length, 35);
  assert.deepEqual(rowOps.map((op) => op.field), state.units.map((_, i) => `units.${i}.radioId`));
  for (const op of rowOps) assert.ok(op.y + LINE_HEIGHT < MAX_Y, `${op.text} at ${op.y} overlaps the bottom margin`);

  const firstPageRows = rowOps.filter((op) => op.p === 0);
  const lastOnFirst = firstPageRows.at(-1);
  assert.ok(lastOnFirst.y + 1.5 * LINE_HEIGHT + LINE_HEIGHT >= MAX_Y, "page 1 is filled before breaking");

  const header1 = texts(pages[0]).filter((op) => op.field === "units" && op.text !== "Alarmierungen");
  const header2 = texts(pages[1]).filter((op) => op.field === "units");
  assert.deepEqual(header2.map((op) => [op.text, op.x]), header1.map((op) => [op.text, op.x]), "same columns on both pages");
  assert.ok(header2.every((op) => op.y === 25));
  near(rowOps.find((op) => op.p === 1).y, 25 + 1.5 * LINE_HEIGHT, "first row on page 2");
});

test("a very long note continues on the next page", () => {
  const base = fixtureJson("test-pdf.json");
  const note = Array.from({ length: 60 }, (_, i) => `Zeile ${i + 1}`).join("\n");
  const { pages } = layout({ ...base, note }, measure, LAYOUT_OPTIONS);
  // Note lines fill page 1 and part of page 2; the 16 table rows then need a third page.
  assert.equal(pages.length, 3);
  for (const page of pages) {
    for (const op of texts(page)) assert.ok(op.y + LINE_HEIGHT < MAX_Y, `${op.text} at ${op.y} overlaps the bottom margin`);
  }
  assert.ok(find(pages[1], "Zeile 60"));
  assert.ok(find(pages[1], "Alarmierungen"), "the table follows the note on page 2");
  assert.equal(find(pages[2], "Funkrufname").y, 25, "the header row is repeated on page 3");
});

test("wrapText wraps at words, keeps line breaks and splits overlong words", () => {
  const width = measure("Flammen weit sichtbar.");
  assert.deepEqual(wrapText("Flammen weit sichtbar. Personen unklar.", width, measure), ["Flammen weit sichtbar.", "Personen unklar."]);
  assert.deepEqual(wrapText("a\n\nb", 100, measure), ["a", "", "b"]);
  const parts = wrapText("x".repeat(200), 50, measure);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(""), "x".repeat(200));
  for (const part of parts) assert.ok(measure(part) <= 50);
});

test("the header shows number, date and time", () => {
  const page = layout(fixtureJson("test-pdf.json"), measure, LAYOUT_OPTIONS).pages[0];
  assert.deepEqual([find(page, "12341234").x, find(page, "12341234").y], [52, 34]);
  assert.deepEqual([find(page, "08.07.2026").x, find(page, "08.07.2026").y], [106, 32]);
  near(find(page, "19:10").y, 32 + LINE_HEIGHT, "time");
  assert.ok(find(page, "Feuerwehr").bold);
  const rects = page.ops.filter((op) => op.type === "rect").map((op) => [op.x, op.y, op.width, op.height]);
  assert.deepEqual(rects, [[15, 25, 35, 15], [50, 25, 28, 15], [78, 25, 25, 15], [103, 25, 39, 15], [142, 25, 53, 15]]);
});
