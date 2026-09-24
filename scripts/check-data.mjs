// Checks what the JSON schemas can't: every radio ID in keywords.json exists in vehicles.json, and
// no radio ID or keyword appears twice. Exits with 1 and lists the problems otherwise.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, root), "utf8"));

export function checkData(vehicles, keywords) {
  const problems = [];
  const vehicleIds = new Set();
  for (const vehicle of vehicles) {
    if (vehicleIds.has(vehicle.radioId)) problems.push(`vehicles.json: radio ID "${vehicle.radioId}" appears more than once`);
    vehicleIds.add(vehicle.radioId);
  }

  const keywordIds = new Set();
  for (const keyword of keywords) {
    const id = `${keyword.category}:${keyword.subcategory}`;
    if (keywordIds.has(id)) problems.push(`keywords.json: keyword "${id}" appears more than once`);
    keywordIds.add(id);
    const seen = new Set();
    for (const radioId of keyword.vehicles) {
      if (!vehicleIds.has(radioId)) problems.push(`keywords.json: "${id}" lists "${radioId}", which is not in vehicles.json`);
      if (seen.has(radioId)) problems.push(`keywords.json: "${id}" lists "${radioId}" more than once`);
      seen.add(radioId);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkData(read("vehicles.json").vehicles, read("keywords.json").keywords);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("keywords.json and vehicles.json are consistent");
}
