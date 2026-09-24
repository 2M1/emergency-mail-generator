// Draws the layout's pages into a PDF with pdf-lib. Converts mm (origin top left) to PDF points
// (origin bottom left).
import { PDFDocument, rgb } from "../vendor/pdf-lib.esm.min.js";
import { fontkit } from "./fonts.js";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./layout.js";

const MM = 72 / 25.4; // pt per mm
const BLACK = rgb(0, 0, 0);

/**
 * @param doc result of layout()
 * @param assets { regular, bold, logo } as Uint8Array (TTF, TTF, PNG)
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(doc, assets) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Not subset: pdf-lib's subsetting drops glyph outlines of PT Serif Regular (blank characters).
  const fonts = {
    regular: await pdf.embedFont(assets.regular, { subset: false }),
    bold: await pdf.embedFont(assets.bold, { subset: false }),
  };
  const images = { logo: assets.logo ? await pdf.embedPng(assets.logo) : null };

  pdf.setTitle(doc.title, { showInWindowTitleBar: true });
  pdf.setCreator("Emergency mail creator");
  pdf.setLanguage("de-DE");

  const x = (mm) => mm * MM;
  const y = (mm) => (PAGE_HEIGHT - mm) * MM;

  for (const { ops } of doc.pages) {
    const page = pdf.addPage([PAGE_WIDTH * MM, PAGE_HEIGHT * MM]);
    for (const op of ops) {
      if (op.type === "text") {
        page.drawText(op.text, { x: x(op.x), y: y(op.y), size: op.size, font: op.bold ? fonts.bold : fonts.regular, color: BLACK });
      } else if (op.type === "line") {
        page.drawLine({ start: { x: x(op.x1), y: y(op.y1) }, end: { x: x(op.x2), y: y(op.y2) }, thickness: op.width, color: BLACK });
      } else if (op.type === "rect") {
        page.drawRectangle({
          x: x(op.x),
          y: y(op.y + op.height),
          width: op.width * MM,
          height: op.height * MM,
          borderWidth: op.lineWidth,
          borderColor: BLACK,
        });
      } else if (op.type === "image" && images[op.name]) {
        page.drawImage(images[op.name], { x: x(op.x), y: y(op.y + op.height), width: op.width * MM, height: op.height * MM });
      }
    }
  }
  return pdf.save();
}
