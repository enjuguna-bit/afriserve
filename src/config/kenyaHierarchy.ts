const HQ_SEED = {
  code: "AFRISERVE-HQ",
  name: "Afriserve Headquarters",
  location: "Nairobi, Kenya",
  contactPhone: "+254700000000",
  contactEmail: "hq@afriserve.co.ke",
};

const KENYA_REGIONS = [
  { code: "NAIROBI_METRO", name: "Nairobi Metro" },
  { code: "CENTRAL", name: "Central" },
  { code: "RIFT_VALLEY", name: "Rift Valley" },
  { code: "WESTERN", name: "Western" },
  { code: "NYANZA", name: "Nyanza" },
  { code: "COAST", name: "Coast" },
  { code: "EASTERN", name: "Eastern" },
  { code: "NORTH_EASTERN", name: "North Eastern" },
];

const COUNTY_BRANCHES = [
  { county: "Mombasa", town: "Mombasa", regionCode: "COAST" },
  { county: "Kwale", town: "Kwale", regionCode: "COAST" },
  { county: "Kilifi", town: "Kilifi", regionCode: "COAST" },
  { county: "Tana River", town: "Hola", regionCode: "COAST" },
  { county: "Lamu", town: "Lamu", regionCode: "COAST" },
  { county: "Taita Taveta", town: "Voi", regionCode: "COAST" },
  { county: "Garissa", town: "Garissa", regionCode: "NORTH_EASTERN" },
  { county: "Wajir", town: "Wajir", regionCode: "NORTH_EASTERN" },
  { county: "Mandera", town: "Mandera", regionCode: "NORTH_EASTERN" },
  { county: "Marsabit", town: "Marsabit", regionCode: "EASTERN" },
  { county: "Isiolo", town: "Isiolo", regionCode: "EASTERN" },
  { county: "Meru", town: "Meru", regionCode: "EASTERN" },
  { county: "Tharaka Nithi", town: "Chuka", regionCode: "EASTERN" },
  { county: "Embu", town: "Embu", regionCode: "EASTERN" },
  { county: "Kitui", town: "Kitui", regionCode: "EASTERN" },
  { county: "Machakos", town: "Machakos", regionCode: "EASTERN" },
  { county: "Makueni", town: "Wote", regionCode: "EASTERN" },
  { county: "Nyandarua", town: "Ol Kalou", regionCode: "CENTRAL" },
  { county: "Nyeri", town: "Nyeri", regionCode: "CENTRAL" },
  { county: "Kirinyaga", town: "Kerugoya", regionCode: "CENTRAL" },
  { county: "Murang'a", town: "Murang'a", regionCode: "CENTRAL" },
  { county: "Kiambu", town: "Kiambu", regionCode: "CENTRAL" },
  { county: "Turkana", town: "Lodwar", regionCode: "RIFT_VALLEY" },
  { county: "West Pokot", town: "Kapenguria", regionCode: "RIFT_VALLEY" },
  { county: "Samburu", town: "Maralal", regionCode: "RIFT_VALLEY" },
  { county: "Trans Nzoia", town: "Kitale", regionCode: "RIFT_VALLEY" },
  { county: "Uasin Gishu", town: "Eldoret", regionCode: "RIFT_VALLEY" },
  { county: "Elgeyo Marakwet", town: "Iten", regionCode: "RIFT_VALLEY" },
  { county: "Nandi", town: "Kapsabet", regionCode: "RIFT_VALLEY" },
  { county: "Baringo", town: "Kabarnet", regionCode: "RIFT_VALLEY" },
  { county: "Laikipia", town: "Rumuruti", regionCode: "RIFT_VALLEY" },
  { county: "Nakuru", town: "Nakuru", regionCode: "RIFT_VALLEY" },
  { county: "Narok", town: "Narok", regionCode: "RIFT_VALLEY" },
  { county: "Kajiado", town: "Kajiado", regionCode: "RIFT_VALLEY" },
  { county: "Kericho", town: "Kericho", regionCode: "RIFT_VALLEY" },
  { county: "Bomet", town: "Bomet", regionCode: "RIFT_VALLEY" },
  { county: "Kakamega", town: "Kakamega", regionCode: "WESTERN" },
  { county: "Vihiga", town: "Mbale", regionCode: "WESTERN" },
  { county: "Bungoma", town: "Bungoma", regionCode: "WESTERN" },
  { county: "Busia", town: "Busia", regionCode: "WESTERN" },
  { county: "Siaya", town: "Siaya", regionCode: "NYANZA" },
  { county: "Kisumu", town: "Kisumu", regionCode: "NYANZA" },
  { county: "Homa Bay", town: "Homa Bay", regionCode: "NYANZA" },
  { county: "Migori", town: "Migori", regionCode: "NYANZA" },
  { county: "Kisii", town: "Kisii", regionCode: "NYANZA" },
  { county: "Nyamira", town: "Nyamira", regionCode: "NYANZA" },
  { county: "Nairobi", town: "Nairobi", regionCode: "NAIROBI_METRO" },
];

const MAJOR_TOWN_BRANCHES = [
  { county: "Nairobi", town: "Westlands", regionCode: "NAIROBI_METRO" },
  { county: "Nairobi", town: "Embakasi", regionCode: "NAIROBI_METRO" },
  { county: "Mombasa", town: "Likoni", regionCode: "COAST" },
  { county: "Kilifi", town: "Malindi", regionCode: "COAST" },
  { county: "Garissa", town: "Dadaab", regionCode: "NORTH_EASTERN" },
  { county: "Machakos", town: "Athi River", regionCode: "EASTERN" },
  { county: "Meru", town: "Maua", regionCode: "EASTERN" },
  { county: "Kiambu", town: "Thika", regionCode: "CENTRAL" },
  { county: "Nakuru", town: "Naivasha", regionCode: "RIFT_VALLEY" },
  { county: "Kajiado", town: "Ngong", regionCode: "RIFT_VALLEY" },
  { county: "Turkana", town: "Kakuma", regionCode: "RIFT_VALLEY" },
  { county: "Kakamega", town: "Mumias", regionCode: "WESTERN" },
  { county: "Bungoma", town: "Webuye", regionCode: "WESTERN" },
  { county: "Kisumu", town: "Ahero", regionCode: "NYANZA" },
  { county: "Kitui", town: "Mwingi", regionCode: "EASTERN" },
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function toSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const KENYA_BRANCH_SEED = [...COUNTY_BRANCHES, ...MAJOR_TOWN_BRANCHES].map((branch, index) => {
  const code = `KE-BR-${String(index + 1).padStart(3, "0")}`;
  return {
    name: `${branch.town} Branch`,
    code,
    county: branch.county,
    town: branch.town,
    locationAddress: `${branch.town}, ${branch.county} County, Kenya`,
    contactPhone: `+254700${String(index + 1).padStart(6, "0")}`,
    contactEmail: `${toSlug(branch.town)}.${toSlug(branch.county)}@afriserve.co.ke`,
    regionCode: branch.regionCode,
  };
});

export {
  HQ_SEED,
  KENYA_REGIONS,
  KENYA_BRANCH_SEED,
};
