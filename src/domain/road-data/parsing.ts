/** Strict DD/MM/YYYY parsing, including leap years; never relies on host timezone. */
export function parseCalendarDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInMonth = days[month - 1];
  if (daysInMonth === undefined || day > daysInMonth) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Preserve the label separately: a range or an ambiguous place is not one km. */
export function parseKilometer(label: string | null): number | null {
  if (label === null) return null;
  const match = /^(?:KM\.?\s*)?(\d+)(?:\+(\d{1,3})|[.,](\d+))?$/i.exec(label.trim());
  if (!match) return null;
  const value =
    Number(match[1]) +
    (match[2] ? Number(match[2]) / 1000 : match[3] ? Number(`0.${match[3]}`) : 0);
  return Number.isFinite(value) && Number.isSafeInteger(Math.trunc(value)) ? value : null;
}
