import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
// @ts-expect-error this doesn't have types
import promise from "eslint-plugin-promise";

export default defineConfig([
    globalIgnores(["dist/"]),

    {
        files: ["src/**/*.{js,mjs,cjs,ts}"],
        plugins: { js },
        extends: ["js/recommended"],
    },
    {
        files: ["src/**/*.{js,mjs,cjs,ts}"],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },

    tseslint.configs.recommended,
    promise.configs["flat/recommended"],
]);
