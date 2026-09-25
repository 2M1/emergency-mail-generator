// The form in the right column. Reads from and writes to the emergency state through callbacks;
// sync() brings the inputs up to date after any change (without touching the focused input).
import { createCombobox } from "./combobox.js";
import {
  addUnit,
  applyKeyword,
  customUnit,
  formatLocalDateTime,
  joinDateTime,
  keywordId,
  removeUnit,
  setUnitTime,
  splitDateTime,
  unitFromVehicle,
  updateUnit,
} from "./state.js";

const KEYWORD_GROUPS = { B: "Brand", H: "Technische Hilfeleistung", R: "Rettungsdienst" };
const VEHICLE_GROUPS = {
  vehicle: "Fahrzeuge",
  trailer: "Anhänger",
  equipment: "Geräte",
  officer: "Führung",
  function: "Funktionen",
  station: "Wache",
  other: "Sonstige",
};
const RADIO_ID_LIKE = /^[A-Z]{2,4} [A-Z]{1,3} \d{2}\/\d{2}(-\d{2})?$/i;

/** Preview fields that represent several inputs (e.g. "Straße Nr." is one line in the PDF). */
const PREVIEW_FIELD = {
  "location.houseNumber": "location.street",
  "location.district": "location.town",
  "patient.lastName": "patient.firstName",
  "object.number": "object.part",
};

const DIGITS_ONLY = new Set(["number", "object.number"]);

function getPath(state, path) {
  const [group, key] = path.split(".");
  return key ? state[group][key] : state[group];
}

function setPath(state, path, value) {
  const [group, key] = path.split(".");
  return key ? { ...state, [group]: { ...state[group], [key]: value } } : { ...state, [group]: value };
}

/** Sets an input's value unless the user is typing in it. */
function setValue(input, value) {
  if (input !== document.activeElement && input.value !== value) input.value = value;
}

const UNIT_ROW = `
  <input type="text" data-unit-field="radioId" spellcheck="false">
  <input type="text" data-unit-field="name" placeholder="Bezeichnung">
  <button type="button" class="icon-button" data-action="remove">✕</button>
  <input type="text" data-unit-field="station" list="stations" placeholder="Wache">
  <span class="time-group">
    <input type="time" data-unit-field="alarmTime">
    <button type="button" class="icon-button" data-action="reset-time" title="Auf die Alarmzeit des Einsatzes zurücksetzen">↺</button>
  </span>
  <span class="unit-tag"></span>`;

/**
 * @param options.getState () => state
 * @param options.onChange (nextState) => void
 * @param options.onActiveField (previewField | null) => void, for highlighting in the preview
 */
export function createForm({ keywords, vehicles, getState, onChange, onActiveField }) {
  const form = document.getElementById("form");
  const keywordInput = document.getElementById("keyword");
  const keywordExample = document.getElementById("keyword-example");
  const unitList = document.getElementById("units");
  const unitsEmpty = document.getElementById("units-empty");
  const unitCount = document.getElementById("unit-count");
  const vehicleSearch = document.getElementById("vehicle-search");
  const stationList = document.getElementById("stations");
  const custom = {
    details: form.querySelector(".custom-unit"),
    radioId: document.getElementById("custom-radio"),
    station: document.getElementById("custom-station"),
    name: document.getElementById("custom-name"),
  };

  const vehiclesById = new Map(vehicles.map((v) => [v.radioId, v]));
  const keywordsById = new Map(keywords.map((k) => [keywordId(k), k]));
  const change = (next) => onChange(next);

  // ---------- keyword ----------

  createCombobox({
    input: keywordInput,
    listbox: document.getElementById("keyword-options"),
    items: () =>
      keywords.map((k) => ({
        keyword: k,
        title: keywordId(k),
        detail: k.example,
        group: KEYWORD_GROUPS[k.category] ?? k.category,
        search: `${keywordId(k)} ${k.example ?? ""}`,
      })),
    onSelect: ({ keyword }) => {
      const state = getState();
      keywordInput.value = keywordId(keyword);
      change(applyKeyword(state, keyword, vehiclesById));
      if (!state.number) form.elements.number.focus();
    },
    // Only listed keywords can be chosen; typed text without a selection is discarded.
    onClose: () => {
      keywordInput.value = getState().keyword;
    },
  });

  // ---------- adding units ----------

  const categoryOrder = Object.keys(VEHICLE_GROUPS);
  const sortedVehicles = [...vehicles].sort(
    (a, b) => categoryOrder.indexOf(a.category ?? "other") - categoryOrder.indexOf(b.category ?? "other"),
  );

  createCombobox({
    input: vehicleSearch,
    listbox: document.getElementById("vehicle-options"),
    keepOpen: true,
    items: (query) => {
      const present = new Set(getState().units.map((u) => u.radioId));
      const items = sortedVehicles.map((v) => ({
        vehicle: v,
        title: v.name,
        detail: [v.radioId, v.station, v.crew && `Besatzung ${v.crew}`, present.has(v.radioId) && "bereits alarmiert"]
          .filter(Boolean)
          .join(" · "),
        group: VEHICLE_GROUPS[v.category ?? "other"],
        search: `${v.radioId} ${v.name} ${v.notes ?? ""}`,
      }));
      if (RADIO_ID_LIKE.test(query) && !vehiclesById.has(query.toUpperCase())) {
        items.push({ customRadioId: query.toUpperCase(), title: `„${query.toUpperCase()}“ hinzufügen …`, detail: "Anderes Einsatzmittel, Wache eintragen", group: "Andere" });
      }
      return items;
    },
    onSelect: (item) => {
      if (item.vehicle) {
        change(addUnit(getState(), unitFromVehicle(item.vehicle)));
        return;
      }
      custom.details.open = true;
      custom.radioId.value = item.customRadioId;
      vehicleSearch.value = "";
      custom.station.focus();
    },
  });

  function addCustomUnit() {
    const radioId = custom.radioId.value.trim();
    if (!radioId) {
      custom.radioId.focus();
      return;
    }
    const known = vehiclesById.get(radioId);
    change(
      addUnit(
        getState(),
        customUnit({ radioId, station: custom.station.value || known?.station || "", name: custom.name.value || known?.name || "" }),
      ),
    );
    custom.radioId.value = custom.station.value = custom.name.value = "";
    custom.radioId.focus();
  }

  document.getElementById("add-custom").addEventListener("click", addCustomUnit);
  for (const input of [custom.radioId, custom.station, custom.name]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCustomUnit();
      }
    });
  }

  // ---------- unit list ----------

  const unitIndex = (element) => Number(element.closest(".unit").dataset.index);

  unitList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const index = unitIndex(button);
    if (button.dataset.action === "remove") {
      const next = removeUnit(getState(), index);
      change(next);
      // Keep the keyboard focus in the list after the row disappeared.
      const rows = unitList.querySelectorAll(".unit");
      const target = rows[Math.min(index, rows.length - 1)];
      (target?.querySelector('[data-action="remove"]') ?? vehicleSearch).focus();
    } else if (button.dataset.action === "reset-time") {
      change(setUnitTime(getState(), index, null));
    }
  });

  function syncUnits(state) {
    while (unitList.children.length > state.units.length) unitList.lastElementChild.remove();
    while (unitList.children.length < state.units.length) {
      const row = document.createElement("li");
      row.className = "unit";
      row.innerHTML = UNIT_ROW;
      unitList.append(row);
    }
    const emergencyTime = splitDateTime(state.alarmTime).time;
    state.units.forEach((unit, i) => {
      const row = unitList.children[i];
      const field = (name) => row.querySelector(`[data-unit-field="${name}"]`);
      const label = unit.radioId || `Einsatzmittel ${i + 1}`;
      row.dataset.index = String(i);
      setValue(field("radioId"), unit.radioId);
      setValue(field("name"), unit.name);
      setValue(field("station"), unit.station);
      const time = field("alarmTime");
      setValue(time, unit.alarmTime ?? emergencyTime);
      time.classList.toggle("inherited", unit.alarmTime === null);
      time.title = unit.alarmTime === null ? "Folgt der Alarmzeit des Einsatzes" : "Eigene Alarmzeit";
      field("radioId").setAttribute("aria-label", `Funkkenner (${label})`);
      field("name").setAttribute("aria-label", `Bezeichnung (${label})`);
      field("station").setAttribute("aria-label", `Wache (${label})`);
      time.setAttribute("aria-label", `Alarmzeit (${label})`);
      const reset = row.querySelector('[data-action="reset-time"]');
      reset.disabled = unit.alarmTime === null;
      reset.setAttribute("aria-label", `Alarmzeit von ${label} zurücksetzen`);
      const remove = row.querySelector('[data-action="remove"]');
      remove.setAttribute("aria-label", `${label} entfernen`);
      remove.title = "Entfernen";
      const fromKeyword = unit.source === "keyword" && !unit.touched;
      row.classList.toggle("from-keyword", fromKeyword);
      const tag = row.querySelector(".unit-tag");
      tag.textContent = fromKeyword ? "Stichwort" : "";
      tag.title = fromKeyword ? "Vom Stichwort hinzugefügt. Wird beim Wechsel des Stichworts ersetzt, solange es nicht bearbeitet wurde." : "";
    });
    unitsEmpty.hidden = state.units.length > 0;
    unitCount.textContent = state.units.length ? `(${state.units.length})` : "";

    const stations = new Set([...vehicles.map((v) => v.station), ...state.units.map((u) => u.station)].filter(Boolean));
    const options = [...stations].sort().map((s) => `<option value="${s.replace(/"/g, "&quot;")}"></option>`).join("");
    if (stationList.innerHTML !== options) stationList.innerHTML = options;
  }

  // ---------- simple fields ----------

  form.addEventListener("input", (event) => {
    const target = event.target;
    const state = getState();
    const unitField = target.dataset.unitField;
    if (unitField) {
      const index = unitIndex(target);
      change(unitField === "alarmTime" ? setUnitTime(state, index, target.value) : updateUnit(state, index, { [unitField]: target.value }));
      return;
    }
    const name = target.name;
    if (!name || name === "keyword") return;
    if (target.type === "checkbox") {
      change({ ...state, [name]: target.checked }); // blueLights, demoNotice
    } else if (name === "alarmDate" || name === "alarmTime") {
      const { date, time } = splitDateTime(state.alarmTime);
      change({ ...state, alarmTime: name === "alarmDate" ? joinDateTime(target.value, time) : joinDateTime(date, target.value) });
    } else {
      if (DIGITS_ONLY.has(name) && /\D/.test(target.value)) target.value = target.value.replace(/\D/g, "");
      change(setPath(state, name, target.value));
    }
  });

  // Inputs skipped by sync() while focused get their value from the state again afterwards
  // (e.g. a cleared unit time shows the inherited time).
  form.addEventListener("focusout", () => setTimeout(() => sync(getState())));

  document.getElementById("now").addEventListener("click", () => {
    change({ ...getState(), alarmTime: formatLocalDateTime(new Date()) });
  });

  // ---------- preview <-> form ----------

  function previewFieldOf(element) {
    if (element === keywordInput) return "keyword";
    if (element === vehicleSearch || element.closest?.(".custom-unit")) return "units";
    if (element.dataset?.unitField) return `units.${unitIndex(element)}.${element.dataset.unitField}`;
    const name = element.name;
    return name ? PREVIEW_FIELD[name] ?? name : null;
  }

  form.addEventListener("focusin", (event) => onActiveField(previewFieldOf(event.target)));
  form.addEventListener("focusout", (event) => {
    if (!form.contains(event.relatedTarget)) onActiveField(null);
  });

  /** Focuses the input behind a preview field such as "location.street" or "units.2.alarmTime". */
  function focusField(field) {
    let input = null;
    const unit = /^units\.(\d+)\.(\w+)$/.exec(field);
    if (unit) {
      input = unitList.children[Number(unit[1])]?.querySelector(`[data-unit-field="${unit[2]}"]`);
    } else if (field === "units") {
      input = vehicleSearch;
    } else if (field === "keyword") {
      input = keywordInput;
    } else {
      input = form.elements[field];
    }
    if (!input) return;
    input.scrollIntoView({ block: "center", behavior: "smooth" });
    input.focus({ preventScroll: true });
  }

  // ---------- sync ----------

  function sync(state) {
    const { date, time } = splitDateTime(state.alarmTime);
    for (const element of form.elements) {
      const name = element.name;
      if (!name || element.dataset.unitField) continue;
      if (element.type === "checkbox") element.checked = state[name] !== false;
      else if (name === "alarmDate") setValue(element, date);
      else if (name === "alarmTime") setValue(element, time);
      else setValue(element, getPath(state, name) ?? "");
    }
    const keyword = keywordsById.get(state.keyword);
    keywordExample.textContent = keyword
      ? keyword.example ?? ""
      : state.keyword
        ? "Stichwort nicht in keywords.json"
        : "Zuerst das Stichwort wählen: es fügt die Standardfahrzeuge hinzu.";
    syncUnits(state);
  }

  return { sync, focusField, focusKeyword: () => keywordInput.focus() };
}
