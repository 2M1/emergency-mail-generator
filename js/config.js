// Settings that are specific to the own fire department.
export const CONFIG = {
  // Alarm table rows whose Wache (or bare radio ID) contains this name are printed bold.
  ownOrganisation: "Kleinmachnow",
  // Prefilled Ort for a new emergency.
  defaultTown: "Kleinmachnow",
  // Printed on two lines in the last header box, next to the logo.
  headerLines: ["Feuerwehr", "Kleinmachnow"],
  // Printed at the bottom of every page while the "kein echter Einsatz" option is on (default).
  demoNotice: "Dies ist kein echter Einsatz. Erstellt mit https://2m1.github.io/emergency-mail-generator/",
  logoUrl: "resources/logo-sw.png",
  fontUrls: {
    regular: "resources/PTSerif-Regular.ttf",
    bold: "resources/PTSerif-Bold.ttf",
  },
  dataUrls: {
    keywords: "keywords.json",
    vehicles: "vehicles.json",
  },
  storageKey: "emergency-mail-creator.draft.v1",
};
