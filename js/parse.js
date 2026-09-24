// Reads a mail body in the Leitstelle's "~~Key~~Value~~" format, following
// ../emergency_mail/src/models/emergency_parsing.rs. Used to import existing alarms and to check
// generated mails in the tests.
import { normalizeEmergency, splitDateTime, unitFromVehicle, UNIT_SOURCE } from "./state.js";

const SIMPLE_KEYS = new Set([
  "Ort", "Ortsteil", "Ortslage", "Strasse", "Hausnummer", "Objekt", "FWPlan", "Objektteil",
  "Objektnummer", "Einsatzart", "Alarmgrund", "Sondersignal", "Einsatznummer", "Besonderheiten",
  "Name", "EMListe", "WGS84_X", "WGS84_Y", "Einsatzortzusatz", "Alarmzeit",
]);
const TWO_VALUE_KEYS = new Set(["Koord_EPSG_25833", "Koord_EPSG_4326"]);

class Scanner {
  constructor(text) {
    this.text = text;
    this.pos = 0;
  }

  get done() {
    return this.pos >= this.text.length;
  }

  get atLineEnd() {
    const c = this.text[this.pos];
    return c === "\r" || c === "\n";
  }

  skipWhitespace() {
    while (!this.done && /\s/.test(this.text[this.pos])) this.pos++;
  }

  skipLine() {
    const end = this.text.indexOf("\n", this.pos);
    this.pos = end < 0 ? this.text.length : end + 1;
  }

  expect(literal) {
    if (!this.text.startsWith(literal, this.pos)) return false;
    this.pos += literal.length;
    return true;
  }

  /** Everything up to the next "~" (line breaks included, as in the Rust parser). */
  readValue() {
    const end = this.text.indexOf("~", this.pos);
    const stop = end < 0 ? this.text.length : end;
    const value = this.text.slice(this.pos, stop);
    this.pos = stop;
    return value;
  }

  /** "~~"-separated values up to the end of the line (Status header and ALARM rows). */
  readRow() {
    const values = [];
    while (!this.done && !this.atLineEnd) {
      values.push(this.readValue());
      if (!this.expect("~~")) {
        this.skipLine();
        break;
      }
    }
    return values;
  }
}

function columnIndices(header) {
  const indices = { unit: 0, station: 0, time: 0 };
  header.forEach((name, i) => {
    if (name === "Fahrzeug" || name === "Zuget") indices.unit = i;
    if (name === "Wache") indices.station = i;
    if (name === "Alarm" || name === "Alarmiert") indices.time = i;
  });
  return indices;
}

/**
 * Returns the raw values: `fields` (simple key/value pairs), `emList` and `alarms`
 * ({ radioId, station, time } per ALARM row, empty rows skipped).
 */
export function parseMail(text) {
  const s = new Scanner(String(text ?? ""));
  const result = { fields: {}, emList: [], alarms: [] };
  let indices = null;

  while (true) {
    s.skipWhitespace();
    if (s.done) break;
    if (!s.expect("~~")) {
      s.skipLine();
      continue;
    }
    const key = s.readValue();
    if (!s.expect("~~")) {
      s.skipLine();
      continue;
    }

    if (key === "Status") {
      indices = columnIndices(s.readRow());
      continue;
    }
    if (key === "ALARM") {
      const values = s.readRow();
      if (!indices || values.length <= Math.max(indices.unit, indices.station, indices.time)) continue;
      // The parser strips trailing non-ASCII characters, i.e. the "ø" the Leitstelle appends.
      const station = values[indices.station].replace(/[^\x00-\x7F]+$/, "").trim();
      const time = values[indices.time].trim();
      if (!station && !time) continue; // "~~ALARM~~#~~ø~~~~~~" = no units
      result.alarms.push({ radioId: values[indices.unit].trim(), station, time });
      continue;
    }
    if (TWO_VALUE_KEYS.has(key)) {
      s.readValue();
      if (!s.expect("~~")) {
        s.skipLine();
        continue;
      }
      s.readValue();
    } else if (SIMPLE_KEYS.has(key)) {
      const value = s.readValue();
      if (key === "EMListe") {
        result.emList = value.split(",").map((id) => id.trim()).filter(Boolean);
      } else {
        result.fields[key] = value;
      }
    } else {
      s.skipLine();
      continue;
    }
    if (!s.expect("~~")) s.skipLine();
  }
  return result;
}

/** "dd.mm.yy&HH:MM" → "20yy-mm-ddTHH:MM", null when it doesn't match. */
export function parseAlarmTime(value) {
  const match = /^\s*(\d{2})\.(\d{2})\.(\d{2})&(\d{2}:\d{2})\s*$/.exec(value ?? "");
  return match ? `20${match[3]}-${match[2]}-${match[1]}T${match[4]}` : null;
}

/**
 * Turns a mail text into an emergency. Unit names come from vehicles.json; units listed in
 * EMListe without an ALARM row are added as well, so no unit gets lost.
 */
export function mailToEmergency(text, { vehiclesById = new Map(), defaults } = {}) {
  const { fields: f, emList, alarms } = parseMail(text);
  const base = normalizeEmergency({}, defaults);
  const alarmTime = parseAlarmTime(f.Alarmzeit) ?? base.alarmTime;
  const emergencyTime = splitDateTime(alarmTime).time;

  const units = alarms.map(({ radioId, station, time }) => {
    const vehicle = vehiclesById.get(radioId);
    const ownTime = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : null;
    return {
      radioId,
      station: station || vehicle?.station || "",
      name: vehicle?.name ?? "",
      alarmTime: ownTime && ownTime !== emergencyTime ? ownTime : null,
      source: UNIT_SOURCE.manual,
      touched: false,
    };
  });
  for (const radioId of emList) {
    if (!units.some((u) => u.radioId === radioId)) {
      units.push(unitFromVehicle(vehiclesById.get(radioId) ?? { radioId }));
    }
  }

  const name = f.Name ?? "";
  const comma = name.indexOf(",");
  const number = (f.Objektnummer ?? "").trim();

  return normalizeEmergency(
    {
      keyword: f.Alarmgrund,
      blueLights: f.Sondersignal === undefined ? base.blueLights : !/^\s*ohne/i.test(f.Sondersignal),
      number: (f.Einsatznummer ?? "").trim(),
      alarmTime,
      location: {
        town: f.Ort,
        district: f.Ortsteil,
        locality: f.Ortslage,
        street: f.Strasse,
        houseNumber: f.Hausnummer,
        addition: f.Einsatzortzusatz,
      },
      object: { name: f.Objekt, part: f.Objektteil, number: number === "-1" ? "" : number, fwPlan: f.FWPlan },
      patient: {
        lastName: comma < 0 ? name : name.slice(0, comma),
        firstName: comma < 0 ? "" : name.slice(comma + 1),
      },
      note: (f.Besonderheiten ?? "").replace(/\r\n?/g, "\n").trim(),
      units,
    },
    base,
  );
}
