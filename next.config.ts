import type { NextConfig } from "next";

const researchFiles = ["./docs/research/*_christian.json", "./docs/research/*_christian.md", "./docs/research/weekly/*_christian.*"];

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
      "./node_modules/@peruroad/road-data/data/exposure/*.gz",
    ],
    // Weekly files are read at request time; curated environmental snapshots are
    // bundled imports. Retain the review documents in production/serverless bundles.
    "/": researchFiles,
    "/api/research": researchFiles,
    "/api/research/documents/*": researchFiles,
  },
  partialPrefetching: true,
  // Keep the team's AGENTS.md as written; `next dev` would otherwise append its own block.
  agentRules: false,
  // The floating dev indicator overlaps the dashboard's bottom-left charts during demos.
  devIndicators: false,
};

export default nextConfig;
