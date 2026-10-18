// Parsers for SUTRAN's free-text and provider-specific formats. Pure functions.

const REGION_LABELS: Record<string, string> = {
  AMAZONAS: "Amazonas",
  ANCASH: "Áncash",
  APURIMAC: "Apurímac",
  AREQUIPA: "Arequipa",
  AYACUCHO: "Ayacucho",
  CAJAMARCA: "Cajamarca",
  CALLAO: "Callao",
  CUSCO: "Cusco",
  HUANCAVELICA: "Huancavelica",
  HUANUCO: "Huánuco",
  ICA: "Ica",
  JUNIN: "Junín",
  "LA LIBERTAD": "La Libertad",
  LAMBAYEQUE: "Lambayeque",
  LIMA: "Lima",
  LORETO: "Loreto",
  "MADRE DE DIOS": "Madre de Dios",
  MOQUEGUA: "Moquegua",
  PASCO: "Pasco",
  PIURA: "Piura",
  PUNO: "Puno",
  "SAN MARTIN": "San Martín",
  TACNA: "Tacna",
  TUMBES: "Tumbes",
  UCAYALI: "Ucayali",
};

// Acronyms that stay uppercase when converting ALL-CAPS provider text to sentence case.
const UPPERCASE_TOKENS = new Set(["KM", "PNP", "MTC", "SUTRAN", "PROVIAS", "SAC", "SA", "S.A.", "S.A.C.", "II", "III"]);
const LOWERCASE_PARTICLES = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en"]);
// Text is treated as ALL-CAPS when at least this share of its letters is uppercase.
const ALL_CAPS_RATIO = 0.7;

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function regionKey(value: string): string {
  return stripAccents(value).toUpperCase().replace(/\s+/g, " ").trim();
}

export function regionLabel(value: string): string {
  return REGION_LABELS[regionKey(value)] ?? titleCase(value);
}

/** Title case for proper names, keeping Spanish particles lowercase ("Santa Cruz de Cocachacra"). */
export function titleCase(value: string): string {
  const words = value.replace(/\s+/g, " ").trim().toLowerCase().split(" ");
  return words
    .map((word, i) => {
      if (i > 0 && LOWERCASE_PARTICLES.has(word)) return word;
      if (/^pe-\d/.test(word)) return word.toUpperCase();
      return word.replace(/(^|-)(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
    })
    .join(" ");
}

/** Converts mostly-uppercase text to sentence case, keeping acronyms and road codes. */
export function toSentenceCase(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return text;
  const upperRatio = letters.replace(/[^\p{Lu}]/gu, "").length / letters.length;
  if (upperRatio < ALL_CAPS_RATIO) return text;
  const lower = text.toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  return sentence.replace(/[\p{L}.]+(?:-\d+\p{L}*)?/gu, (word) => {
    const upper = word.toUpperCase();
    return UPPERCASE_TOKENS.has(upper) || /^PE-\d/.test(upper) ? upper : word;
  });
}

/** SUTRAN dates (fechaEvento, vigenteDesde, vigenteHasta) are DD/MM/YYYY; returns YYYY-MM-DD or null. */
export function parseSutranDate(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses SUTRAN's free-text kilometer field: "KM 51" → 51, "KM 64+800" → 64.8,
 * "KM 770 + 800" → 770.8, "KM 41+948 - 41+982" → 41.948 to 41.982, "Km 04" → 4.
 */
export function parseKm(value: string | null | undefined): { km: number | null; kmEnd: number | null } {
  if (!value) return { km: null, kmEnd: null };
  const values: number[] = [];
  for (const match of value.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*\+\s*(\d{1,3}))?/g)) {
    const wholeKm = Number(match[1].replace(",", "."));
    const extraKm = match[2] ? Number(match[2].padEnd(3, "0")) / 1000 : 0;
    if (Number.isFinite(wholeKm)) values.push(Math.round((wholeKm + extraKm) * 1000) / 1000);
    if (values.length === 2) break;
  }
  return { km: values[0] ?? null, kmEnd: values[1] ?? null };
}

/** Accepts only absolute http(s) URLs from provider data. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  if (!URL.canParse(value.trim())) return null;
  const url = new URL(value.trim());
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}
