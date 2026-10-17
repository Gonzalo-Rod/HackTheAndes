import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";

// Static, trusted SVG markup (24×24, stroke-based). Shared by React components and
// by the map markers, which are plain DOM elements created outside React.
const ICONS = {
  // Causes
  accidentes:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  infraestructura: '<path d="M9.6 3.5h4.8l4.1 16H5.5z"/><path d="M7.4 12.5h9.2"/><path d="M2.5 20.5h19"/>',
  fenomenos_naturales:
    '<path d="m2.5 20.5 6.8-12 4.2 6.6 2.1-3.1 5.9 8.5z"/><circle cx="16.8" cy="4.6" r="1.6"/><circle cx="20.2" cy="8.4" r="1.1"/>',
  humano: '<circle cx="12" cy="7.5" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  otro: '<circle cx="12" cy="12" r="3.2"/>',
  // Road status
  interrumpido: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>',
  restringido: '<path d="M12 3.2 2.6 19.8h18.8z"/><path d="M12 9.6v4.6"/><path d="M12 17.1v.2"/>',
  normal: '<circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.8 2.8 5.6-5.8"/>',
  desconocido: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17v.2"/>',
  // Interface
  play: '<path d="M7 4.6v14.8l12-7.4z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M5 4.8v14.4l10-7.2z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
  prev: '<path d="M19 4.8v14.4L9 12z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  external:
    '<path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6.5A1.5 1.5 0 0 1 5.5 5H10"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  north: '<path d="M12 2.5 18.5 20 12 16.2 5.5 20z" fill="currentColor" stroke="none"/>',
  maximize:
    '<path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v3M20.5 8V5A1.5 1.5 0 0 0 19 3.5h-3M3.5 16v3A1.5 1.5 0 0 0 5 20.5h3M16 20.5h3a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  minimize:
    '<path d="M8 3.5v3A1.5 1.5 0 0 1 6.5 8h-3M20.5 8h-3A1.5 1.5 0 0 1 16 6.5v-3M3.5 16h3A1.5 1.5 0 0 1 8 17.5v3M16 20.5v-3a1.5 1.5 0 0 1 1.5-1.5h3"/>',
  crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  route:
    '<circle cx="6" cy="18.5" r="2.5"/><path d="M8.5 18.5h8.8a3.5 3.5 0 0 0 0-7H6.7a3.5 3.5 0 0 1 0-7H15.5"/><circle cx="18" cy="4.5" r="2.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  orbit: '<path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5c2.4 0 4.5 1 6 2.5L20.5 8.5"/><path d="M20.5 3.5v5h-5"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7.5 15 4-5 3 3 4.5-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  layers: '<path d="m12 3.5 8.5 4.7L12 13 3.5 8.2z"/><path d="m3.5 12.6 8.5 4.8 8.5-4.8"/><path d="m3.5 16.6 8.5 4.8 8.5-4.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.2"/>',
  source:
    '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  mountain: '<path d="m2.5 20 7-12.5 4 7 2.5-4 5.5 9.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  arrowRight: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.5-4.5L6 19.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function iconMarkup(name: IconName, size = 16, strokeWidth = 2): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, strokeWidth = 2, className, title }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : "") + ICONS[name] }}
    />
  );
}

export const causeIcon = (cause: AlertCause): IconName => cause;
export const statusIcon = (status: RoadStatus): IconName => status;

/** Brand mark: two Andean ridges crossed by a road. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M1.5 25 11 9l5.5 8.6L20 12l10.5 13z" fill="#c2512c" />
      <path d="M11 9l2.6 4.1-1.6-.9-1.4 1.6-1.2-1.3-1.5.9z" fill="#fbfaf6" opacity="0.9" />
      <path d="M6 30c3-4.5 8.5-3.5 11-6.5s5.5-3 9-2.5" fill="none" stroke="#1f1c17" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M6 30c3-4.5 8.5-3.5 11-6.5s5.5-3 9-2.5"
        fill="none"
        stroke="#fbfaf6"
        strokeWidth="0.8"
        strokeDasharray="1.6 1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
