import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Native loading keeps the package's import.meta.url-based CA lookup intact.
  serverExternalPackages: ["@peruroad/road-data", "pg"],
  outputFileTracingIncludes: {
    "/api/jobs/sutran": ["../../packages/road-data/certs/*.crt"],
  },
};

export default config;
