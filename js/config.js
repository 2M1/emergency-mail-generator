// Settings that are specific to the own fire department.
export const CONFIG = {
  // Alarm table rows whose Wache (or bare radio ID) contains this name are printed bold.
  ownOrganisation: "Kleinmachnow",
  // Prefilled Ort for a new emergency.
  defaultTown: "Kleinmachnow",
  // Printed on two lines in the last header box, next to the logo.
  headerLines: ["Feuerwehr", "Kleinmachnow"],
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
