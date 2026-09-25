import { readFileSync } from "node:fs";
import { measureFromBytes } from "../js/fonts.js";

const root = new URL("../", import.meta.url);

export const readText = (path) => readFileSync(new URL(path, root), "utf8");
export const readJson = (path) => JSON.parse(readText(path));
export const readBytes = (path) => new Uint8Array(readFileSync(new URL(path, root)));

export const fixture = (name) => readText(`tests/fixtures/${name}`);
export const fixtureJson = (name) => readJson(`tests/fixtures/${name}`);

export const assets = {
  regular: readBytes("resources/PTSerif-Regular.ttf"),
  bold: readBytes("resources/PTSerif-Bold.ttf"),
  logo: readBytes("resources/logo-sw.png"),
};

export const measure = measureFromBytes(assets);

export const vehicles = readJson("vehicles.json").vehicles;
export const keywords = readJson("keywords.json").keywords;
export const vehiclesById = new Map(vehicles.map((v) => [v.radioId, v]));
export const findKeyword = (id) => keywords.find((k) => k.keyword === id);

export const LAYOUT_OPTIONS = { headerLines: ["Feuerwehr", "Kleinmachnow"], ownOrganisation: "Kleinmachnow" };
