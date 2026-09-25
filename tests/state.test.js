import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addUnit,
  applyKeyword,
  createEmergency,
  customUnit,
  fileBaseName,
  keywordCategory,
  loadDraft,
  missingFields,
  normalizeEmergency,
  removeUnit,
  saveDraft,
  setUnitTime,
  unitAlarmTime,
  unitFromVehicle,
  updateUnit,
} from "../js/state.js";
import { findKeyword, vehiclesById } from "./helpers.js";

const start = () => createEmergency({ now: new Date(2026, 6, 8, 19, 10), town: "Kleinmachnow" });
const radioIds = (state) => state.units.map((u) => u.radioId);

test("a new emergency starts at the given time with the default town", () => {
  const state = start();
  assert.equal(state.alarmTime, "2026-07-08T19:10");
  assert.equal(state.location.town, "Kleinmachnow");
  assert.deepEqual(state.units, []);
});

test("selecting a keyword sets Sondersignal and adds its default vehicles", () => {
  const keyword = findKeyword("B:Gebäude-Groß");
  const state = applyKeyword({ ...start(), blueLights: false }, keyword, vehiclesById);
  assert.equal(state.keyword, "B:Gebäude-Groß");
  assert.equal(state.blueLights, keyword.blueLights);
  assert.deepEqual(radioIds(state), keyword.vehicles);
  const first = state.units[0];
  assert.equal(first.name, vehiclesById.get(first.radioId).name);
  assert.equal(first.station, vehiclesById.get(first.radioId).station);
  assert.equal(first.alarmTime, null);
  assert.equal(first.source, "keyword");
});

test("switching keywords replaces untouched keyword units and keeps manual and edited ones", () => {
  // B:Gebäude-Groß adds 44-01, 36-01, 11-01, 59-01; 36-01 gets edited, a Teltow unit is added by hand.
  let state = applyKeyword(start(), findKeyword("B:Gebäude-Groß"), vehiclesById);
  assert.deepEqual(radioIds(state), ["FL PM 01/44-01", "FL PM 01/36-01", "FL PM 01/11-01", "FL PM 01/59-01"]);
  state = updateUnit(state, 1, { name: "umbenannt" });
  state = addUnit(state, customUnit({ radioId: "FL PM 03/44-01", station: "PM FW Teltow" }));

  // H:Klein only adds 43-01.
  const hKlein = applyKeyword(state, findKeyword("H:Klein"), vehiclesById);
  assert.equal(hKlein.keyword, "H:Klein");
  assert.deepEqual(radioIds(hKlein), ["FL PM 01/36-01", "FL PM 03/44-01", "FL PM 01/43-01"]);
  assert.equal(hKlein.units[0].name, "umbenannt");

  // B:Klein lists 44-01 too, so that unit stays where it is.
  const bKlein = applyKeyword(state, findKeyword("B:Klein"), vehiclesById);
  assert.deepEqual(radioIds(bKlein), ["FL PM 01/44-01", "FL PM 01/36-01", "FL PM 03/44-01"]);
});

test("Rettungsdienst keywords add the First Responder vehicle with Sondersignal", () => {
  for (const id of ["R1N0", "R1N1f", "R1N1p"]) {
    const state = applyKeyword({ ...start(), blueLights: false }, findKeyword(id), vehiclesById);
    assert.equal(state.keyword, id);
    assert.equal(state.blueLights, true, id);
    assert.deepEqual(radioIds(state), ["FL PM 01/85-01"], id);
  }
});

test("the category comes from the Alarmgrund in both notations", () => {
  assert.equal(keywordCategory("B:Gebäude-Groß"), "B");
  assert.equal(keywordCategory("H:VU mit P"), "H");
  assert.equal(keywordCategory("R1N1f"), "R");
  assert.equal(keywordCategory("R2N0"), "R");
  assert.equal(keywordCategory("B:"), "");
  assert.equal(keywordCategory("Rettung"), "");
  assert.equal(keywordCategory(""), "");
});

test("a keyword doesn't add a vehicle that is already in the list", () => {
  const keyword = findKeyword("B:Klein");
  let state = addUnit(start(), unitFromVehicle(vehiclesById.get(keyword.vehicles[0])));
  state = applyKeyword(state, keyword, vehiclesById);
  assert.equal(radioIds(state).filter((id) => id === keyword.vehicles[0]).length, 1);
  assert.equal(state.units[0].source, "manual");
});

test("unit times follow the emergency time until overridden, and reset back", () => {
  let state = addUnit(start(), unitFromVehicle(vehiclesById.get("FL PM 01/44-01")));
  assert.equal(unitAlarmTime(state, state.units[0]), "19:10");

  state = { ...state, alarmTime: "2026-07-08T19:30" };
  assert.equal(unitAlarmTime(state, state.units[0]), "19:30");

  state = setUnitTime(state, 0, "19:35");
  state = { ...state, alarmTime: "2026-07-08T19:40" };
  assert.equal(unitAlarmTime(state, state.units[0]), "19:35");

  state = setUnitTime(state, 0, null);
  assert.equal(unitAlarmTime(state, state.units[0]), "19:40");
  assert.equal(setUnitTime(state, 0, "").units[0].alarmTime, null);
});

test("editing marks a unit as touched only when something changed", () => {
  const state = applyKeyword(start(), findKeyword("B:Klein"), vehiclesById);
  assert.equal(updateUnit(state, 0, { name: state.units[0].name }).units[0].touched, false);
  assert.equal(updateUnit(state, 0, { station: "PM FW Teltow" }).units[0].touched, true);
  assert.equal(setUnitTime(state, 0, "19:11").units[0].touched, true);
});

test("removing a unit", () => {
  const state = applyKeyword(start(), findKeyword("B:Gebäude-Groß"), vehiclesById);
  const removed = removeUnit(state, 0);
  assert.deepEqual(radioIds(removed), radioIds(state).slice(1));
});

test("drafts are normalized and storage errors don't throw", () => {
  const defaults = start();
  const draft = normalizeEmergency(
    { keyword: 42, blueLights: "yes", alarmTime: "gestern", location: { town: null, street: "Hauptstr." }, units: [null, { radioId: "X", alarmTime: "7" }] },
    defaults,
  );
  assert.equal(draft.keyword, "42");
  assert.equal(draft.blueLights, true);
  assert.equal(draft.alarmTime, defaults.alarmTime);
  assert.equal(draft.location.town, "Kleinmachnow");
  assert.equal(draft.location.street, "Hauptstr.");
  assert.deepEqual(draft.units, [{ radioId: "X", station: "", name: "", alarmTime: null, source: "manual", touched: false }]);

  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(loadDraft(broken, "key", defaults), null);
  assert.equal(saveDraft(broken, "key", defaults), false);
  assert.equal(loadDraft(null, "key", defaults), null);

  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const state = applyKeyword(defaults, findKeyword("H:Klein"), vehiclesById);
  assert.equal(saveDraft(storage, "key", state), true);
  assert.deepEqual(loadDraft(storage, "key", defaults), state);
  assert.equal(loadDraft({ getItem: () => "{not json" }, "key", defaults), null);
});

test("file names use date, time and keyword without characters Windows forbids", () => {
  assert.equal(fileBaseName({ ...start(), keyword: "B:Gebäude-Groß" }), "2026-07-08_19-10_B-Gebäude-Groß");
  assert.equal(fileBaseName({ ...start(), keyword: "B:Wald Groß/WSP" }), "2026-07-08_19-10_B-Wald Groß-WSP");
  assert.equal(fileBaseName(start()), "2026-07-08_19-10_Einsatz");
});

test("missing fields are reported", () => {
  assert.deepEqual(missingFields(start()), ["Stichwort", "Einsatznummer", "Straße", "Einsatzmittel"]);
  const complete = {
    ...applyKeyword(start(), findKeyword("B:Klein"), vehiclesById),
    number: "1",
    location: { ...start().location, street: "Am Bannwald" },
  };
  assert.deepEqual(missingFields(complete), []);
});
