import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Vendored bolt-cep runtime and the ExtendScript polyfill are kept as shipped.
  { ignores: ["dist", "node_modules", "src/js/lib/cep", "src/jsx/lib", "test-results", "playwright-report"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Copied from bolt-cep; loose typing there is upstream's.
    files: ["src/js/lib/utils/**/*.ts", "src/jsx/utils/**/*.ts", "src/jsx/global.d.ts", "vite.es.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-var": "off",
      "prefer-const": "off",
      "no-useless-escape": "off",
      "no-constant-condition": "off",
    },
  },
  {
    // The After Effects typings are loose (property() returns a union, Layer lacks AVLayer fields), so the host
    // casts through any where it has already checked propertyType.
    files: ["src/jsx/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // The UI reaches After Effects only through the bridge (spec: Host bridge).
    files: ["src/js/ide/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["**/lib/utils/bolt", "**/lib/cep/*"] }],
    },
  },
);
