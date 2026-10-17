export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  const local = compact.replace(/^(?:\+51|0051|51)(?=9\d{8}$)/, "");
  return /^9\d{8}$/.test(local) ? `+51${local}` : null;
}
