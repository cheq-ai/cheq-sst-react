import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const { version } = createRequire(import.meta.url)("./package.json");

// Mirrors tsup's define so tests see the same LIBRARY_VERSION the bundles ship with.
const define = { __LIB_VERSION__: JSON.stringify(version) };

// Two projects: the native bundle prefers `.native.ts` (see tsup.config.ts), so without
// mirroring that here every test resolved the web variant -- covering native code with web
// stubs. `*.native.test.ts` runs native; everything else runs web.
export default defineConfig({
    define,
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "web",
                    environment: "node",
                    include: ["test/**/*.test.ts"],
                    exclude: ["test/**/*.native.test.ts"],
                },
            },
            {
                extends: true,
                // Same preference order tsup uses for the React Native build.
                resolve: {
                    extensions: [".native.ts", ".native.tsx", ".ts", ".tsx", ".js", ".jsx", ".json"],
                },
                test: {
                    name: "native",
                    environment: "node",
                    include: ["test/**/*.native.test.ts"],
                },
            },
        ],
    },
});
