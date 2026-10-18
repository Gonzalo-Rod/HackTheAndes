import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "@/styles/dashboard.css";
import "@/styles/panels.css";
import "@/styles/map.css";
import "@/styles/forecast.css";
import "@/styles/responsive.css";
import "@/styles/platform.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "PeruRoad Climate · Estado vial del Perú",
  description:
    "Mapa 3D de las alertas viales vigentes de SUTRAN en el Perú, con foco en la Carretera Central (PE-22): estado de la vía, motivo, historial y perfil del corredor.",
};

export const viewport: Viewport = {
  themeColor: "#f5f2eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
