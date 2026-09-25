// Builds the mail body in the "~~Key~~Value~~" format that the Leitstelle sends and
// ../emergency_mail parses (see src/models/emergency_parsing.rs there).
import { emList, view } from "./state.js";

const EMERGENCY_TYPES = { B: "Brandeinsatz", H: "Hilfeleistungseinsatz", R: "Rettungseinsatz" };

export const STATUS_LINE = "~~Status~~Tableau-Adresse~~Wache~~Fahrzeug~~Alarmiert~~Ausgerückt~~";
/** Real mails contain this single row when no unit was alarmed. */
export const EMPTY_ALARM_ROW = "~~ALARM~~#~~ø~~~~~~";

const field = (key, value) => `~~${key}~~${value}~~`;

/**
 * One ALARM row. "unbekannt#" and the "ø" after the Wache copy the Leitstelle's format; the parser
 * strips trailing non-ASCII characters from the Wache, so the "ø" also protects names ending in
 * an umlaut.
 */
const alarmRow = (unit) => `~~ALARM~~unbekannt#~~${unit.station}ø~~${unit.radioId}~~${unit.time}~~~~`;

/** "YYYY-MM-DD" + "HH:MM" → "dd.mm.yy&HH:MM", empty when incomplete. */
export function mailAlarmTime(date, time) {
  const match = /^\d{2}(\d{2})-(\d{2})-(\d{2})$/.exec(date);
  return match && time ? `${match[3]}.${match[2]}.${match[1]}&${time}` : "";
}

export function toMailText(state) {
  const v = view(state);
  const lines = [
    field("Ort", v.location.town),
    field("Ortsteil", v.location.district),
    field("Ortslage", v.location.locality),
    field("Strasse", v.location.street),
    field("Hausnummer", v.location.houseNumber),
    field("Objekt", v.object.name),
    field("FWPlan", v.object.fwPlan),
    field("Objektteil", v.object.part),
    field("Objektnummer", v.object.number || "-1"),
    field("Einsatzart", EMERGENCY_TYPES[v.category] ?? ""),
    field("Alarmgrund", v.keyword),
    field("Sondersignal", v.sondersignal),
    field("Einsatznummer", v.number),
    field("Besonderheiten", v.note),
    field("Name", `${v.patient.lastName},${v.patient.firstName}`),
    field("EMListe", emList(state).join(", ")),
    STATUS_LINE,
    ...(v.units.length ? v.units.map(alarmRow) : [EMPTY_ALARM_ROW]),
    field("Einsatzortzusatz", v.location.addition),
    field("Alarmzeit", mailAlarmTime(v.date, v.time)),
  ];
  return `${lines.join("\n")}\n`;
}
