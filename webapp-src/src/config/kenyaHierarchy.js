// Minimal Kenya hierarchy seed for backend seeding

export const HQ_SEED = {
  name: "Afriserve HQ",
  code: "AFRI-HQ",
  location: "Nairobi",
  contactPhone: "+254700000000",
  contactEmail: "hq@afriserve.local"
};

export const KENYA_REGIONS = [
  { name: "Nairobi", code: "NBI" },
  { name: "Central", code: "CEN" },
  { name: "Coast", code: "CST" },
  { name: "Western", code: "WST" },
  { name: "Rift Valley", code: "RV" }
];

export const KENYA_BRANCH_SEED = [
  { name: "Nairobi Main", code: "NBI-MAIN", regionCode: "NBI" },
  { name: "Mombasa Main", code: "CST-MAIN", regionCode: "CST" },
  { name: "Nakuru Branch", code: "NAKURU-MAIN", regionCode: "RV", locationAddress: "Nakuru CBD", county: "Nakuru", town: "Nakuru", contactPhone: "+254701234567", contactEmail: "nakuru@afriserve.local" }
];
