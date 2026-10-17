import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/**/*.ts", "src/**/*.tsx"], rules: { "@typescript-eslint/no-non-null-assertion": "error" } },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/integrations/**", "src/**/*.test.ts", "src/**/*.integration.ts"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.name='fetch']", message: "Use the integration HTTP wrapper." }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored MapLibre worker copied from node_modules by scripts/copy-maplibre-worker.mjs.
    "public/maplibre/**",
    "apps/**",
    "packages/**",
  ]),
]);

export default eslintConfig;
