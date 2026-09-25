import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_ALARM_ROW, STATUS_LINE, toMailText } from "../js/mail.js";
import { mailToEmergency, parseMail } from "../js/parse.js";
import { createEmergency } from "../js/state.js";
import { fixture, fixtureJson, vehiclesById } from "./helpers.js";

const lineOf = (mail, key) => mail.split("\n").find((line) => line.startsWith(`~~${key}~~`));
const unit = (radioId, station = "PM FW Kleinmachnow", alarmTime = null) => ({
  radioId, station, name: "", alarmTime, source: "manual", touched: false,
});
const emergency = (overrides = {}) => ({ ...createEmergency({ now: new Date(2026, 6, 8, 19, 10) }), ...overrides });

test("the example emergency produces the expected mail", () => {
  assert.equal(toMailText(fixtureJson("example.json")), fixture("example.txt"));
});

test("fields are written in the Leitstelle's order", () => {
  const keys = toMailText(fixtureJson("example.json"))
    .trim()
    .split("\n")
    .map((line) => line.split("~~")[1]);
  assert.deepEqual(keys, [
    "Ort", "Ortsteil", "Ortslage", "Strasse", "Hausnummer", "Objekt", "FWPlan", "Objektteil", "Objektnummer",
    "Einsatzart", "Alarmgrund", "Sondersignal", "Einsatznummer", "Besonderheiten", "Name", "EMListe", "Status",
    "ALARM", "ALARM", "Einsatzortzusatz", "Alarmzeit",
  ]);
});

test("~ is removed from every value", () => {
  const mail = toMailText(
    emergency({
      keyword: "B:Klein",
      location: { town: "Klein~machnow", district: "", locality: "", street: "~~Am Bannwald~~", houseNumber: "1~", addition: "" },
      note: "a ~ b",
      units: [unit("FL PM 01/44-01", "PM ~FW Kleinmachnow")],
    }),
  );
  assert.equal(lineOf(mail, "Ort"), "~~Ort~~Kleinmachnow~~");
  assert.equal(lineOf(mail, "Strasse"), "~~Strasse~~Am Bannwald~~");
  assert.equal(lineOf(mail, "Hausnummer"), "~~Hausnummer~~1~~");
  assert.equal(lineOf(mail, "Besonderheiten"), "~~Besonderheiten~~a  b~~");
  assert.equal(lineOf(mail, "ALARM"), "~~ALARM~~unbekannt#~~PM FW Kleinmachnowø~~FL PM 01/44-01~~19:10~~~~");
});

test("an empty unit list writes the Leitstelle's empty ALARM row", () => {
  const mail = toMailText(emergency());
  assert.equal(lineOf(mail, "EMListe"), "~~EMListe~~~~");
  assert.equal(lineOf(mail, "Status"), STATUS_LINE);
  assert.equal(lineOf(mail, "ALARM"), EMPTY_ALARM_ROW);
});

test("units without a radio ID are left out", () => {
  const mail = toMailText(emergency({ units: [unit(""), unit("FL PM 01/44-01")] }));
  assert.equal(mail.split("\n").filter((line) => line.startsWith("~~ALARM~~")).length, 1);
  assert.equal(lineOf(mail, "EMListe"), "~~EMListe~~FL PM 01/44-01~~");
});

test("EMListe is sorted and unique, ALARM keeps every row in list order", () => {
  const mail = toMailText(
    emergency({ units: [unit("RT PM 03/83-01", "PM RW Teltow"), unit("FL PM 01/44-01"), unit("RT PM 03/83-01", "PM RW Teltow", "19:15")] }),
  );
  assert.equal(lineOf(mail, "EMListe"), "~~EMListe~~FL PM 01/44-01, RT PM 03/83-01~~");
  const rows = mail.split("\n").filter((line) => line.startsWith("~~ALARM~~"));
  assert.deepEqual(rows, [
    "~~ALARM~~unbekannt#~~PM RW Teltowø~~RT PM 03/83-01~~19:10~~~~",
    "~~ALARM~~unbekannt#~~PM FW Kleinmachnowø~~FL PM 01/44-01~~19:10~~~~",
    "~~ALARM~~unbekannt#~~PM RW Teltowø~~RT PM 03/83-01~~19:15~~~~",
  ]);
});

test("unit times follow the emergency time unless overridden", () => {
  const state = emergency({ alarmTime: "2026-07-08T20:05", units: [unit("FL PM 01/44-01"), unit("FL PM 01/11-01", "PM FW Kleinmachnow", "20:07")] });
  const rows = toMailText(state).split("\n").filter((line) => line.startsWith("~~ALARM~~"));
  assert.match(rows[0], /~~20:05~~~~$/);
  assert.match(rows[1], /~~20:07~~~~$/);
  assert.equal(lineOf(toMailText(state), "Alarmzeit"), "~~Alarmzeit~~08.07.26&20:05~~");
});

test("the note keeps line breaks, single-line fields don't", () => {
  const state = emergency({ note: "Zeile 1\r\nZeile 2\n\nZeile 4  ", location: { ...emergency().location, addition: "Hydrant\nlinks" } });
  const mail = toMailText(state);
  assert.ok(mail.includes("~~Besonderheiten~~Zeile 1\nZeile 2\n\nZeile 4~~\n"));
  assert.equal(lineOf(mail, "Einsatzortzusatz"), "~~Einsatzortzusatz~~Hydrant links~~");
});

test("patient, object number, Einsatzart and Sondersignal formats", () => {
  const empty = toMailText(emergency());
  assert.equal(lineOf(empty, "Name"), "~~Name~~,~~");
  assert.equal(lineOf(empty, "Objektnummer"), "~~Objektnummer~~-1~~");
  assert.equal(lineOf(empty, "Einsatzart"), "~~Einsatzart~~~~");

  const filled = toMailText(
    emergency({
      keyword: "H:VU Klemm",
      blueLights: false,
      patient: { firstName: "Anna", lastName: "Müller, geb. Schulz" },
      object: { name: "", part: "", number: "abc", fwPlan: "" },
    }),
  );
  assert.equal(lineOf(filled, "Name"), "~~Name~~Müller  geb. Schulz,Anna~~");
  assert.equal(lineOf(filled, "Objektnummer"), "~~Objektnummer~~-1~~");
  assert.equal(lineOf(filled, "Einsatzart"), "~~Einsatzart~~Hilfeleistungseinsatz~~");
  assert.equal(lineOf(filled, "Alarmgrund"), "~~Alarmgrund~~H:VU Klemm~~");
  assert.equal(lineOf(filled, "Sondersignal"), "~~Sondersignal~~ohne Sondersignal~~");
});

test("a generated mail reads back into the same emergency", () => {
  const original = fixtureJson("example.json");
  const imported = mailToEmergency(toMailText(original), { vehiclesById });
  const comparable = (state) => ({ ...state, units: state.units.map(({ radioId, station, name, alarmTime }) => ({ radioId, station, name, alarmTime })) });
  assert.deepEqual(comparable(imported), comparable(original));
  assert.equal(toMailText(imported), fixture("example.txt"));
});

test("real Leitstelle mails are parsed like the Rust parser does", () => {
  const simple = mailToEmergency(fixture("emergency_simple.txt"), { vehiclesById });
  assert.equal(simple.keyword, "H:Natur");
  assert.equal(simple.blueLights, false);
  assert.equal(simple.number, "300000001");
  assert.equal(simple.alarmTime, "2022-04-01T08:23");
  assert.deepEqual(simple.location, {
    town: "Brandenburg an der Havel", district: "Musterhöfe/BRB", locality: "Übungsweg", street: "Übungsweg", houseNumber: "1", addition: "",
  });
  assert.deepEqual(simple.patient, { firstName: "", lastName: "" });
  assert.equal(simple.object.number, "");
  assert.deepEqual(
    simple.units.map((u) => [u.radioId, u.station, u.alarmTime]),
    [
      ["FL BRB 01/16-21", "BRB FW Brandenburg 1", "08:21"],
      ["FL BRB 01/16-21", "BRB FW Brandenburg 1", "08:22"],
      ["RLS BRB DGL 2", "BRB FW Brandenburg 1", null],
    ],
  );

  const object = mailToEmergency(fixture("emergency_obj.txt"), { vehiclesById });
  assert.deepEqual(object.units, []);
  assert.deepEqual(object.patient, { firstName: "Vorname (Pat.)", lastName: "Name (Pat.)" });
  assert.equal(object.object.fwPlan, "0101999");
  assert.equal(object.location.addition, "Sonstige");

  const many = parseMail(fixture("emergency_many_units.txt"));
  assert.equal(many.alarms.length, 35);
  assert.equal(many.emList.length, 34);
  assert.deepEqual(many.alarms[0], { radioId: "FL PM 01/01-01", station: "PM AMT Kleinmachnow", time: "00:01" });
});

test("Rettungsdienst keywords are written as they are, with Einsatzart Rettungseinsatz", () => {
  const mail = toMailText(emergency({ keyword: "R1N1f", units: [unit("FL PM 01/85-01")] }));
  assert.equal(lineOf(mail, "Einsatzart"), "~~Einsatzart~~Rettungseinsatz~~");
  assert.equal(lineOf(mail, "Alarmgrund"), "~~Alarmgrund~~R1N1f~~");
  assert.equal(lineOf(mail, "Sondersignal"), "~~Sondersignal~~mit Sondersignal~~");
});

test("a Leitstelle EMS mail is imported with its FR mapping row and empty alarm time", () => {
  // EMListe only lists the RT units here; "FR Kleinmachnow" is the EMS name of the fire
  // department, not a radio ID, and FL PM 01/85-01 has no alarm time.
  const ems = mailToEmergency(fixture("emergency_r1n1f.txt"), { vehiclesById });
  assert.equal(ems.keyword, "R1N1f");
  assert.equal(ems.alarmTime, "2026-01-01T12:00");
  assert.deepEqual(ems.patient, { firstName: "", lastName: "Mustermann" });
  assert.deepEqual(
    ems.units.map((u) => [u.radioId, u.station, u.name, u.alarmTime]),
    [
      ["RT PM 03/82-01", "PM RW Teltow", "", "11:59"],
      ["RT PM 03/83-04", "PM RW Teltow", "", "11:59"],
      ["FR Kleinmachnow", "PM FW Kleinmachnow", "", null],
      ["FL PM 01/85-01", "PM FW Kleinmachnow", "RTW FR Kleinmachnow", null],
    ],
  );
  const mail = toMailText(ems);
  assert.equal(lineOf(mail, "Einsatzart"), "~~Einsatzart~~Rettungseinsatz~~");
  assert.equal(lineOf(mail, "Name"), "~~Name~~Mustermann,~~");
  assert.equal(lineOf(mail, "EMListe"), "~~EMListe~~FL PM 01/85-01, FR Kleinmachnow, RT PM 03/82-01, RT PM 03/83-04~~");
});
