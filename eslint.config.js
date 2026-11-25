import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

function forbid(files, patterns) {
  return {
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: patterns.map((group) => ({
            group: [group],
            message: `Layer boundary violation: ${files.join(", ")} may not import from ${group}`,
          })),
        },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ["dist/**", "legacy/**", "node_modules/**", ".superpowers/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-var": "warn",
      "prefer-const": "warn",
    },
  },
  forbid(["src/engine/**/*.ts"], [
    "**/graphics/**",
    "**/audio/**",
    "**/levels/**",
    "**/gameplay/**",
    "**/visuals/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/graphics/**/*.ts"], [
    "**/audio/**",
    "**/levels/**",
    "**/gameplay/**",
    "**/visuals/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/audio/**/*.ts"], [
    "**/graphics/**",
    "**/levels/**",
    "**/gameplay/**",
    "**/visuals/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/levels/**/*.ts"], [
    "**/engine/**",
    "**/graphics/**",
    "**/audio/**",
    "**/gameplay/**",
    "**/visuals/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/gameplay/**/*.ts"], [
    "**/graphics/**",
    "**/audio/**",
    "**/visuals/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/visuals/**/*.ts"], [
    "**/audio/**",
    "**/ui/**",
    "**/persistence/**",
    "**/app/**",
  ]),
  forbid(["src/ui/**/*.ts", "src/persistence/**/*.ts"], [
    "**/graphics/**",
    "**/audio/**",
    "**/gameplay/**",
    "**/visuals/**",
    "**/app/**",
  ]),
);
