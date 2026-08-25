import { defineConfig } from "tsup";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json");

// Keeps LIBRARY_VERSION in sync with package.json instead of hand-editing it. See src/Info.ts.
const define = { __LIB_VERSION__: JSON.stringify(version) };

export default defineConfig([
    // Web/default build
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        outDir: "dist",
        clean: true,
        external: ["react"],
        define,
    },

    // React Native build
    {
        entry: ["src/index.ts"],
        format: ["esm"],
        dts: false,
        outDir: "dist",
        outExtension: () => ({ js: ".native.js" }),
        platform: "neutral",
        clean: false,

        // ✅ critical: do NOT bundle RN (Flow) sources, or any other bare dependency.
        // Bundling RN packages inlines their CJS interop as dynamic __require("react")
        // calls, which Metro cannot see statically -> "Requiring unknown module react"
        // at runtime. Externalize every non-relative specifier and let Metro resolve it.
        external: [/^[^./]/],
        define,

        esbuildOptions(options) {
            // Prefer .native.* implementations
            options.resolveExtensions = [
                ".native.ts",
                ".native.tsx",
                ".ts",
                ".tsx",
                ".js",
                ".jsx",
                ".json",
            ];
        },
    },
]);