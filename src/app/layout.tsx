import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "@/styles/dashboard.css";
import "@/styles/panels.css";
import "@/styles/map.css";
import "@/styles/forecast.css";
import "@/styles/responsive.css";
import "@/styles/platform.css";
import "@/styles/research_christian.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "PeruRoad Climate · Clima, territorio y accesos",
  description:
    "Estado vial de SUTRAN y evidencias oficiales de clima y territorio: agua, heladas, lluvias, laderas, agricultura y plagas, con fuentes, fechas y límites de cobertura.",
};

export const viewport: Viewport = {
  themeColor: "#f7f7f8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
