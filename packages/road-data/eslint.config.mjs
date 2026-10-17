import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/integrations/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "External calls must use src/integrations/http/.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch']",
          message: "External calls must use src/integrations/http/.",
        },
      ],
    },
  },
);
