// Loads PT Serif and measures text with the same metrics pdf-lib uses when it embeds the font:
// the sum of the glyph advances after fontkit's layout (ligatures applied, no kerning).
import fontkit from "../vendor/fontkit.es.min.js";
import { FONT_SIZE, PT } from "./layout.js";

export { fontkit };

/** @returns (text, bold) => width in mm at FONT_SIZE */
export function createMeasure(regularFont, boldFont) {
  const cache = new Map();
  return (text, bold = false) => {
    const key = `${bold ? "b" : "r"}${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      const font = bold ? boldFont : regularFont;
      const advance = font.layout(String(text)).glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
      width = (advance / font.unitsPerEm) * FONT_SIZE * PT;
      if (cache.size > 5000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
}

/** Creates the measure function from the raw TTF bytes ({ regular, bold }). */
export function measureFromBytes({ regular, bold }) {
  return createMeasure(fontkit.create(regular), fontkit.create(bold));
}
