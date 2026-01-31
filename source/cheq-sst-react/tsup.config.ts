import { defineConfig } from "tsup";

export default defineConfig([
    // Web/default build
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        outDir: "dist",
        clean: true,
        external: ["react"],
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

        // ✅ critical: do NOT bundle RN (Flow) sources
        external: ["react", "react-native"],

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