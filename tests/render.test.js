import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "../vendor/pdf-lib.esm.min.js";
import { layout } from "../js/layout.js";
import { mailToEmergency } from "../js/parse.js";
import { renderPdf } from "../js/render-pdf.js";
import { pageToSvg } from "../js/render-svg.js";
import { assets, fixture, fixtureJson, LAYOUT_OPTIONS, measure, vehiclesById } from "./helpers.js";

test("the PDF has A4 pages, the title and the layout's page count", async () => {
  const state = mailToEmergency(fixture("emergency_many_units.txt"), { vehiclesById });
  const doc = layout(state, measure, LAYOUT_OPTIONS);
  const pdf = await PDFDocument.load(await renderPdf(doc, assets));
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getTitle(), "Einsatz am 2023-08-06 um 00:00:00");
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.01 && Math.abs(height - 841.89) < 0.01);
});

test("the SVG preview uses mm coordinates and escapes text", () => {
  const state = { ...fixtureJson("test-pdf.json"), note: "<b>Tür & Tor</b>" };
  const svg = pageToSvg(layout(state, measure, LAYOUT_OPTIONS).pages[0], { logo: "resources/logo-sw.png" }, "Seite 1");
  assert.match(svg, /viewBox="0 0 210 297"/);
  assert.match(svg, /&lt;b&gt;Tür &amp; Tor&lt;\/b&gt;/);
  assert.match(svg, /<text x="18" y="52" font-size="4.233" font-weight="700" data-field="keyword">Stichwort:<\/text>/);
  assert.match(svg, /<image href="resources\/logo-sw.png"/);
});
