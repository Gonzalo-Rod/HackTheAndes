import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@peruroad/road-data", "pg"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@peruroad/road-data/certs/*.crt",
      "./public/data/pe22.json",
      "./node_modules/@peruroad/road-data/data/pe22/catchments.json",
      "./node_modules/@peruroad/road-data/data/pe22/hazards.json",
      "./node_modules/@peruroad/road-data/data/pe22/catchment-terrain.json",
      "./node_modules/@peruroad/road-data/data/weather/*.gz",
      "./node_modules/@peruroad/road-data/data/events/pe22-events.json",
    ],
  },
  partialPrefetching: true,
  // Keep the team's AGENTS.md as written; `next dev` would otherwise append its own block.
  agentRules: false,
  // The floating dev indicator overlaps the dashboard's bottom-left charts during demos.
  devIndicators: false,
};

export default nextConfig;
