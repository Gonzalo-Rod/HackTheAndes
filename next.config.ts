import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@peruroad/road-data", "pg"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/**": ["./node_modules/@peruroad/road-data/certs/*.crt", "./public/data/pe22.json"] },
  partialPrefetching: true,
  // Keep the team's AGENTS.md as written; `next dev` would otherwise append its own block.
  agentRules: false,
  // The floating dev indicator overlaps the dashboard's bottom-left charts during demos.
  devIndicators: false,
};

export default nextConfig;
