import js from "@eslint/js";
import globals from "globals";
import tseslint from "./frontend-next/node_modules/typescript-eslint/dist/index.js";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "data/**", "public/**", ".runtime/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // The repo still has a large explicit-any surface across legacy adapters.
      // Keep strict TS checks and focus lint on actionable correctness issues.
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "error",
    },
  },
];
