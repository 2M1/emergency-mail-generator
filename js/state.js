// Emergency data model and the rules that keep it consistent. Pure functions, no DOM access,
// so everything here also runs under `node --test`.

export const UNIT_SOURCE = { keyword: "keyword", manual: "manual" };

const pad = (n) => String(n).padStart(2, "0");

/** Local date and time as "YYYY-MM-DDTHH:MM" (minute precision, like the mail). */
export function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Splits "YYYY-MM-DDTHH:MM" into its parts. Missing parts are empty strings. */
export function splitDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})?(?:T(\d{2}:\d{2}))?/.exec(value ?? "");
  return { date: match?.[1] ?? "", time: match?.[2] ?? "" };
}

export function joinDateTime(date, time) {
  return `${date ?? ""}T${time ?? ""}`;
}

export function createEmergency({ now = new Date(), town = "" } = {}) {
  return {
    keyword: "",
    blueLights: true,
    number: "",
    alarmTime: formatLocalDateTime(now),
    location: { town, district: "", locality: "", street: "", houseNumber: "", addition: "" },
    object: { name: "", part: "", number: "", fwPlan: "" },
    patient: { firstName: "", lastName: "" },
    note: "",
    units: [],
  };
}

// ---------- keywords and units ----------

export function keywordId(keyword) {
  return `${keyword.category}:${keyword.subcategory}`;
}

/** "B" for "B:Gebäude-Groß", empty when there is no category. */
export function keywordCategory(id) {
  const index = (id ?? "").indexOf(":");
  return index < 0 ? "" : id.slice(0, index);
}

export function unitFromVehicle(vehicle, source = UNIT_SOURCE.manual) {
  return {
    radioId: vehicle.radioId,
    station: vehicle.station ?? "",
    name: vehicle.name ?? "",
    alarmTime: null,
    source,
    touched: false,
  };
}

export function customUnit({ radioId, station = "", name = "" }) {
  return { radioId: radioId.trim(), station: station.trim(), name: name.trim(), alarmTime: null, source: UNIT_SOURCE.manual, touched: false };
}

/**
 * Selects a keyword: sets the default Sondersignal, removes the untouched units the previous
 * keyword added and appends the new keyword's default vehicles that aren't in the list yet.
 * Manual and edited units stay, and so do keyword units the new keyword also lists (in place).
 */
export function applyKeyword(state, keyword, vehiclesById) {
  const defaults = new Set(keyword.vehicles);
  const kept = state.units.filter((u) => u.source !== UNIT_SOURCE.keyword || u.touched || defaults.has(u.radioId));
  const present = new Set(kept.map((u) => u.radioId));
  const added = keyword.vehicles
    .filter((radioId) => !present.has(radioId))
    .map((radioId) => unitFromVehicle(vehiclesById.get(radioId) ?? { radioId }, UNIT_SOURCE.keyword));
  return { ...state, keyword: keywordId(keyword), blueLights: keyword.blueLights, units: [...kept, ...added] };
}

export function addUnit(state, unit) {
  return { ...state, units: [...state.units, unit] };
}

export function removeUnit(state, index) {
  return { ...state, units: state.units.filter((_, i) => i !== index) };
}

/** Applies a change to one unit. Any real change marks the unit as edited, so keyword switches keep it. */
export function updateUnit(state, index, patch) {
  const units = state.units.map((unit, i) => {
    if (i !== index) return unit;
    const changed = Object.keys(patch).some((key) => patch[key] !== unit[key]);
    return changed ? { ...unit, ...patch, touched: true } : unit;
  });
  return { ...state, units };
}

/** Sets a unit's own alarm time ("HH:MM"). Empty or null makes it follow the emergency time again. */
export function setUnitTime(state, index, time) {
  return updateUnit(state, index, { alarmTime: /^\d{2}:\d{2}$/.test(time ?? "") ? time : null });
}

/** The time shown in the ALARM table: the unit's override, otherwise the emergency's time. */
export function unitAlarmTime(state, unit) {
  return unit.alarmTime ?? splitDateTime(state.alarmTime).time;
}

/** Radio IDs for EMListe: unique and sorted, as the Leitstelle sends them. */
export function emList(state) {
  return [...new Set(state.units.map((u) => cleanValue(u.radioId)).filter(Boolean))].sort();
}

// ---------- output values ----------

/** Single-line value: "~" is the mail's field delimiter, line breaks become spaces. */
export function cleanValue(value) {
  return String(value ?? "").replace(/~/g, "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Multi-line value (the note): keeps line breaks, removes "~". */
export function cleanMultiline(value) {
  return String(value ?? "").replace(/~/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

/** Objektnummer as an integer string, empty when not set or not a number. */
export function objectNumber(value) {
  const text = cleanValue(value);
  return /^-?\d+$/.test(text) && Number(text) !== -1 ? String(Number(text)) : "";
}

export function sondersignalText(blueLights) {
  return blueLights ? "mit Sondersignal" : "ohne Sondersignal";
}

/**
 * The cleaned values that both outputs use, so the mail text and the PDF always show the same data.
 */
export function view(state) {
  const { date, time } = splitDateTime(state.alarmTime);
  const clean = (group) => Object.fromEntries(Object.entries(group).map(([key, value]) => [key, cleanValue(value)]));
  return {
    keyword: cleanValue(state.keyword),
    category: keywordCategory(cleanValue(state.keyword)),
    sondersignal: sondersignalText(state.blueLights),
    number: cleanValue(state.number),
    date,
    time,
    location: clean(state.location),
    object: { ...clean(state.object), number: objectNumber(state.object.number) },
    patient: {
      firstName: cleanValue(state.patient.firstName).replace(/,/g, " ").trim(),
      lastName: cleanValue(state.patient.lastName).replace(/,/g, " ").trim(),
    },
    note: cleanMultiline(state.note),
    // Units without a radio ID (e.g. a row still being typed) appear in neither output.
    // `index` points back into state.units.
    units: state.units
      .map((unit, index) => ({
        index,
        radioId: cleanValue(unit.radioId),
        station: cleanValue(unit.station),
        name: cleanValue(unit.name),
        time: cleanValue(unitAlarmTime(state, unit)),
      }))
      .filter((unit) => unit.radioId),
  };
}

/** Base name for downloads: "YYYY-MM-DD_HH-MM_<Stichwort>", without characters Windows forbids. */
export function fileBaseName(state) {
  const { date, time } = splitDateTime(state.alarmTime);
  const keyword = cleanValue(state.keyword).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return [date, time.replace(":", "-"), keyword || "Einsatz"].filter(Boolean).join("_");
}

/** Labels of fields that a usable alarm printout needs but are still empty. */
export function missingFields(state) {
  const { date, time } = splitDateTime(state.alarmTime);
  const missing = [];
  if (!cleanValue(state.keyword)) missing.push("Stichwort");
  if (!cleanValue(state.number)) missing.push("Einsatznummer");
  if (!date || !time) missing.push("Alarmzeit");
  if (!cleanValue(state.location.street)) missing.push("Straße");
  if (!cleanValue(state.location.town)) missing.push("Ort");
  if (!state.units.some((u) => cleanValue(u.radioId))) missing.push("Einsatzmittel");
  return missing;
}

// ---------- persistence ----------

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));

/** Merges untrusted data (a stored draft or an import) into a complete, well-typed emergency. */
export function normalizeEmergency(raw, defaults = createEmergency()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const group = (name) => {
    const values = source[name] && typeof source[name] === "object" ? source[name] : {};
    return Object.fromEntries(Object.keys(defaults[name]).map((key) => [key, text(values[key] ?? defaults[name][key])]));
  };
  const units = Array.isArray(source.units) ? source.units : [];
  return {
    keyword: text(source.keyword ?? defaults.keyword),
    blueLights: typeof source.blueLights === "boolean" ? source.blueLights : defaults.blueLights,
    number: text(source.number ?? defaults.number),
    alarmTime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(source.alarmTime) ? source.alarmTime : defaults.alarmTime,
    location: group("location"),
    object: group("object"),
    patient: group("patient"),
    note: text(source.note ?? defaults.note),
    units: units
      .filter((u) => u && typeof u === "object")
      .map((u) => ({
        radioId: text(u.radioId),
        station: text(u.station),
        name: text(u.name),
        alarmTime: /^\d{2}:\d{2}$/.test(u.alarmTime) ? u.alarmTime : null,
        source: u.source === UNIT_SOURCE.keyword ? UNIT_SOURCE.keyword : UNIT_SOURCE.manual,
        touched: u.touched === true,
      })),
  };
}

/** Reads the autosaved draft. Returns null when there is none or storage is unavailable. */
export function loadDraft(storage, key, defaults) {
  try {
    const json = storage?.getItem(key);
    return json ? normalizeEmergency(JSON.parse(json), defaults) : null;
  } catch {
    return null;
  }
}

export function saveDraft(storage, key, state) {
  try {
    storage?.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // storage unavailable: nothing to clear
  }
}
