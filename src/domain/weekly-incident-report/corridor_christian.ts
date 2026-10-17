import type { RoadAlert } from "@/contracts/road-alerts";
import type { IndeciPlace } from "@/contracts/weekly-incident-report_christian";
import { regionKey, stripAccents } from "@/domain/road-alerts/parsing";

// The report corridor is the Carretera Central from Lima to Huancayo: PE-22 from Lima to
// La Oroya, then PE-3S from La Oroya to Huancayo. PE-22 continues from La Oroya to Tarma and
// La Merced, and other roads are also called "Carretera Central" (Huánuco, Pasco); both are
// outside the corridor. Pure functions.

/** Accent-free upper case with hyphens as spaces, for comparing place names. */
export function placeKey(value: string): string {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const keySet = (names: string[]): ReadonlySet<string> => new Set(names.map(placeKey));

/** Provinces each road crosses inside the corridor, as SUTRAN names them. */
const CORRIDOR_PROVINCES: Readonly<Record<string, ReadonlySet<string>>> = {
  "PE-22": keySet(["Lima", "Huarochirí", "Yauli"]),
  "PE-3S": keySet(["Yauli", "Jauja", "Concepción", "Huancayo"]),
};

/** An alert without a province cannot be placed on the corridor and is left out; every SUTRAN record read had one. */
export function isCorridorAlert(alert: Pick<RoadAlert, "roadCode" | "province">): boolean {
  const provinces = CORRIDOR_PROVINCES[alert.roadCode];
  return provinces !== undefined && provinces.has(placeKey(regionKey(alert.province)));
}

/** Districts along the corridor, by department, for INDECI reports ("DISTRITO DE <name> – <department>"). */
const CORRIDOR_DISTRICTS: Readonly<Record<string, ReadonlySet<string>>> = {
  LIMA: keySet([
    "Ate",
    "Santa Anita",
    "Chaclacayo",
    "Lurigancho",
    "Lurigancho-Chosica",
    "Ricardo Palma",
    "Santa Cruz de Cocachacra",
    "San Bartolomé",
    "Surco",
    "Matucana",
    "San Mateo",
    "Chicla",
  ]),
  JUNIN: keySet([
    "Morococha",
    "Yauli",
    "Santa Rosa de Sacco",
    "La Oroya",
    "Huay-Huay",
    "Canchayllo",
    "Llocllapampa",
    "Jauja",
    "Yauyos",
    "Huertas",
    "Huamalí",
    "Matahuasi",
    "Concepción",
    "San Jerónimo de Tunán",
    "Saño",
    "San Agustín",
    "San Agustín de Cajas",
    "El Tambo",
    "Huancayo",
  ]),
};

/** Provinces whose province-level INDECI reports cover the corridor. */
const CORRIDOR_INDECI_PROVINCES: Readonly<Record<string, ReadonlySet<string>>> = {
  LIMA: keySet(["Huarochirí"]),
  JUNIN: keySet(["Yauli", "Jauja", "Concepción", "Huancayo"]),
};

export function isCorridorPlace(place: IndeciPlace): boolean {
  const department = placeKey(place.department);
  const names = place.level === "distrito" ? CORRIDOR_DISTRICTS[department] : CORRIDOR_INDECI_PROVINCES[department];
  return names !== undefined && place.names.some((name) => names.has(placeKey(name)));
}

/** INDECI hazards that can affect the road. Fires, wind, frost, drought and earthquakes are left out. */
const ROAD_HAZARD_PATTERN =
  /HUAICO|HUAYCO|DESLIZAMIENTO|DERRUMBE|CAIDA DE ROCAS|DESPRENDIMIENTO|ALUD|AVALANCHA|INUNDACION|DESBORDE|EROSION|LLUVIA|PRECIPITACION|NEVADA|GRANIZADA|ACCIDENTE DE TRANSPORTE MEDIO TERRESTRE|COLAPSO DE (PUENTE|VIA|CARRETERA|TROCHA)|HUNDIMIENTO|REPTACION/;

export function isRoadRelevantHazard(hazard: string): boolean {
  return ROAD_HAZARD_PATTERN.test(placeKey(hazard));
}

/** Places that tie a news title to the corridor on their own (accent-free, lower case). */
const STRONG_PLACE_TERMS = [
  "carretera central",
  "chosica",
  "chaclacayo",
  "huachipa",
  "ricardo palma",
  "cocachacra",
  "matucana",
  "ticlio",
  "casapalca",
  "morococha",
  "la oroya",
  "huarochiri",
  "yanacoto",
  "chicla",
  "pachacayo",
];

/**
 * Names that also exist elsewhere ("San Mateo Tlacoxcalco") or cover more than the corridor
 * (Junín, the Rímac); they count only next to a strong term.
 */
const WEAK_PLACE_TERMS = ["ate", "santa anita", "san mateo", "jauja", "concepcion", "huancayo", "el tambo", "rimac", "junin"];

/** "Carretera Central" alone is not enough: Huánuco, Pasco and Tarma roads share the name. */
const SHARED_ROAD_NAME = "carretera central";

/** Places outside the corridor, and the planned Nueva Carretera Central, which is project news. */
const EXCLUDED_PLACE_TERMS = [
  "nueva carretera central",
  "huanuco",
  "tingo maria",
  "pasco",
  "huariaca",
  "tarma",
  "la merced",
  "chanchamayo",
  "satipo",
  "pichanaqui",
  "oxapampa",
  "ambo",
  "miraflores",
];

/** Word stems of crime news, which often names corridor places but is not a road incident. */
const EXCLUDED_TOPIC_STEMS = ["balazo", "balacera", "asesin", "sicari", "extorsi", "disparo", "ataque", "armad", "asalt", "delincu"];

/** Incident words, matched as whole words. */
const INCIDENT_TERMS = [
  "accidente",
  "accidentes",
  "choque",
  "choca",
  "choco",
  "colision",
  "despiste",
  "despisto",
  "volcadura",
  "vuelca",
  "volco",
  "atropellado",
  "atropellada",
  "atropello",
  "muere",
  "mueren",
  "murio",
  "murieron",
  "muerto",
  "muertos",
  "fallece",
  "fallecen",
  "fallecio",
  "fallecido",
  "fallecidos",
  "herido",
  "heridos",
  "herida",
  "heridas",
  "huaico",
  "huaicos",
  "huayco",
  "huaycos",
  "derrumbe",
  "derrumbes",
  "deslizamiento",
  "deslizamientos",
  "rocas",
  "desprendimiento",
  "alud",
  "nevada",
  "granizada",
  "inundacion",
  "desborde",
  "bloqueo",
  "bloqueos",
  "bloquean",
  "paro",
  "protesta",
  "cierre",
  "cierran",
  "cerrada",
  "cerrado",
  "restringido",
  "restringida",
  "restriccion",
  "interrumpido",
  "interrumpida",
  "interrupcion",
  "transito",
  "obras",
  "mantenimiento",
  "varados",
  "colapso",
];

export interface NewsMatch {
  placeTerms: string[];
  incidentTerms: string[];
}

/** Lower-case words separated by single spaces, padded with spaces for whole-word search. */
function wordText(value: string): string {
  return ` ${stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const hasWords = (text: string, phrase: string) => text.includes(` ${phrase} `);
const hasStem = (text: string, stem: string) => text.includes(` ${stem}`);

export type NewsTitleCheck =
  | { kind: "match"; match: NewsMatch }
  /** An incident on a "Carretera Central" with no corridor place to say which one. */
  | { kind: "road-name-only" }
  | { kind: "no-match" };

/**
 * Classifies a news title: a match names a corridor place and an incident. Titles that name a
 * place outside the corridor or a crime are rejected.
 */
export function classifyNewsTitle(title: string): NewsTitleCheck {
  const text = wordText(title);
  if (EXCLUDED_PLACE_TERMS.some((term) => hasWords(text, term))) return { kind: "no-match" };
  if (EXCLUDED_TOPIC_STEMS.some((stem) => hasStem(text, stem))) return { kind: "no-match" };

  const strong = STRONG_PLACE_TERMS.filter((term) => hasWords(text, term));
  const weak = WEAK_PLACE_TERMS.filter((term) => hasWords(text, term));
  const incidentTerms = INCIDENT_TERMS.filter((term) => hasWords(text, term));
  if (strong.length === 0 || incidentTerms.length === 0) return { kind: "no-match" };
  if (strong.every((term) => term === SHARED_ROAD_NAME) && weak.length === 0) return { kind: "road-name-only" };
  return { kind: "match", match: { placeTerms: [...strong, ...weak], incidentTerms } };
}

/** The matched terms of a title that classifies as a match, otherwise null. */
export function matchNewsTitle(title: string): NewsMatch | null {
  const check = classifyNewsTitle(title);
  return check.kind === "match" ? check.match : null;
}
