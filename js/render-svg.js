// Draws the layout's pages as SVG for the live preview. One SVG user unit is 1 mm, so the layout's
// coordinates are used unchanged.
import { PAGE_HEIGHT, PAGE_WIDTH, PT } from "./layout.js";

const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const n = (value) => Number(value.toFixed(3));

function opToSvg(op, images) {
  switch (op.type) {
    case "text": {
      const field = op.field ? ` data-field="${escapeXml(op.field)}"` : "";
      const weight = op.bold ? ` font-weight="700"` : "";
      return `<text x="${n(op.x)}" y="${n(op.y)}" font-size="${n(op.size * PT)}"${weight}${field}>${escapeXml(op.text)}</text>`;
    }
    case "line":
      return `<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" stroke-width="${n(op.width * PT)}"/>`;
    case "rect":
      return `<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.width)}" height="${n(op.height)}" stroke-width="${n(op.lineWidth * PT)}"/>`;
    case "image":
      return images[op.name]
        ? `<image href="${escapeXml(images[op.name])}" x="${n(op.x)}" y="${n(op.y)}" width="${n(op.width)}" height="${n(op.height)}"/>`
        : "";
    default:
      return "";
  }
}

/** @param images map of image name → URL, e.g. { logo: "resources/logo-sw.png" } */
export function pageToSvg(page, images, label) {
  return (
    `<svg class="sheet" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(label)}">` +
    `<rect class="paper" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}"/>` +
    page.ops.map((op) => opToSvg(op, images)).join("") +
    `</svg>`
  );
}
