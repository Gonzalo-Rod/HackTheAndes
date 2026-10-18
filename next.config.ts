import type { NextConfig } from "next";

const researchFiles = ["./docs/research/*_christian.json", "./docs/research/*_christian.md", "./docs/research/weekly/*_christian.*"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the team's AGENTS.md as written; `next dev` would otherwise append its own block.
  agentRules: false,
  // The floating dev indicator overlaps the dashboard's bottom-left charts during demos.
  devIndicators: false,
  // Weekly files are read at request time; curated environmental snapshots are
  // bundled imports. Retain the review documents in production/serverless bundles.
  outputFileTracingIncludes: {
    "/": researchFiles,
    "/api/research": researchFiles,
    "/api/research/documents/*": researchFiles,
  },
};

export default nextConfig;
