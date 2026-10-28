import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Use the generated client through @/server/db and types from @/generated/prisma.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message: "Import types from @/generated/prisma and the client from @/server/db.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
