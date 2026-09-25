import assert from "node:assert/strict";
import { test } from "node:test";
import { checkData } from "../scripts/check-data.mjs";
import { keywords, vehicles } from "./helpers.js";

test("keywords.json and vehicles.json are consistent", () => {
  assert.deepEqual(checkData(vehicles, keywords), []);
});

test("unknown and duplicate radio IDs are reported", () => {
  const problems = checkData(
    [{ radioId: "FL PM 01/44-01" }, { radioId: "FL PM 01/44-01" }],
    [
      { keyword: "B:Klein", category: "B", vehicles: ["FL PM 01/44-01", "FL PM 09/99-01", "FL PM 01/44-01"] },
      { keyword: "B:Klein", category: "B", vehicles: [] },
    ],
  );
  assert.deepEqual(problems, [
    'vehicles.json: radio ID "FL PM 01/44-01" appears more than once',
    'keywords.json: "B:Klein" lists "FL PM 09/99-01", which is not in vehicles.json',
    'keywords.json: "B:Klein" lists "FL PM 01/44-01" more than once',
    'keywords.json: keyword "B:Klein" appears more than once',
  ]);
});
