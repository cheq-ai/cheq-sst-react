import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The native-only code paths reach consumers solely through tsup's `.native.ts` resolution
 * (see tsup.config.ts). Nothing else asserts that wiring, so breaking it ships a native
 * bundle with no uuid handling while every other test stays green. CI runs `npm run build`
 * before `npm test`, so these artifacts exist by the time this runs.
 */
const dist = (name: string) => resolve(__dirname, "..", "dist", name);

function read(name: string): string {
    const path = dist(name);
    if (!existsSync(path)) {
        throw new Error(`${name} is missing -- run \`npm run build\` before the test suite.`);
    }
    return readFileSync(path, "utf8");
}

describe("build artifacts", () => {
    it("emits all three entry points", () => {
        for (const f of ["index.native.js", "index.js", "index.cjs"]) {
            expect(existsSync(dist(f)), `${f} should exist`).toBe(true);
        }
    });

    it("puts the native uuid handling in the native bundle only", () => {
        expect(read("index.native.js")).toContain("x-offsite-uuid");
        // Leaking it into the web builds would mean .native.ts resolution bled across targets.
        expect(read("index.js")).not.toContain("x-offsite-uuid");
        expect(read("index.cjs")).not.toContain("x-offsite-uuid");
    });

    it("keeps optional requires literal so Metro can resolve them statically", () => {
        const native = read("index.native.js");
        // `__require(...)` is what esbuild emits when shimming require into ESM; Metro cannot
        // see through it, and the modules silently never enter the bundle.
        expect(native).not.toContain("__require(");
        expect(native).toContain('require("react-native-device-info")');
    });

    it("exports the public API from the native bundle", () => {
        expect(read("index.native.js")).toContain("module.exports");
    });
});
