import type { NextConfig } from "next";
import { resolve } from "node:path";

const researchFiles = ["./docs/research/*_christian.json", "./docs/research/*_christian.md"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@peruroad/road-data", "pg"],
  webpack(config: { snapshot?: { unmanagedPaths?: (string | RegExp)[] } }) {
    // The local file: package changes without a version bump; cached client schemas must follow its files.
    config.snapshot = {
      ...config.snapshot,
      unmanagedPaths: [...(config.snapshot?.unmanagedPaths ?? []), resolve(process.cwd(), "node_modules/@peruroad/road-data")],
    };
    return config;
  },
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
      "./node_modules/@peruroad/road-data/data/events/national-events.json",
      "./node_modules/@peruroad/road-data/data/exposure/*.gz",
      "./node_modules/@peruroad/road-data/data/roads/registry.json",
      "./node_modules/@peruroad/road-data/data/roads/*/exposure.json.gz",
    ],
    // Research documents are read at request time; retain them in serverless bundles.
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
