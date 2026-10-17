import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "External calls belong in an integration adapter.",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
