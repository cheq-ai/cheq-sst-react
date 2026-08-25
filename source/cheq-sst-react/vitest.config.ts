import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const { version } = createRequire(import.meta.url)("./package.json");

export default defineConfig({
    // Mirrors tsup's define so tests see the same LIBRARY_VERSION the bundles ship with.
    define: { __LIB_VERSION__: JSON.stringify(version) },
    test: {
        environment: "node",
        include: ["test/**/*.test.ts"],
    },
});
