import Module from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ASYNC_STORAGE = "@react-native-async-storage/async-storage";

/**
 * The premise of this module is that a missing (or unloadable) optional peer degrades to null
 * instead of throwing at import time. Nothing else in the suite exercises that.
 *
 * These run under node, where some RN packages load fine and others fail on their Flow syntax
 * regardless of being installed. Both outcomes are exercised below: `optional()` must return
 * the module when the require succeeds and null when it throws, never propagating.
 */
const ACCESSORS = [
    "getDeviceInfo",
    "getExpoTrackingTransparency",
    "getRNTrackingTransparency",
    "getLocalize",
    "getExpoLocalization",
    "getAsyncStorage",
] as const;

beforeEach(() => { vi.resetModules(); });

describe("optionalModules (native)", () => {
    it("never propagates a failed require", async () => {
        const mod = await import("../src/platform/optionalModules.native");

        // The premise of the module: an unloadable peer degrades, it does not throw.
        for (const name of ACCESSORS) {
            expect(() => mod[name](), `${name}() must not throw`).not.toThrow();
        }
    });

    it("returns the module when the require succeeds", async () => {
        const mod = await import("../src/platform/optionalModules.native");

        // react-native-localize is a devDependency and loads under node, so this covers the
        // success path -- without it, `optional()` could return null unconditionally.
        const localize = mod.getLocalize();
        expect(localize).not.toBeNull();
        expect(typeof localize?.getTimeZone).toBe("function");
    });

    it("returns null for a peer that cannot be loaded", async () => {
        const mod = await import("../src/platform/optionalModules.native");

        // react-native-device-info fails to parse under node, standing in for an absent peer.
        expect(mod.getDeviceInfo()).toBeNull();
    });

    it("returns null for an AsyncStorage peer that cannot be loaded", async () => {
        const mod = await import("../src/platform/optionalModules.native");

        // v3's ESM build does not resolve under node, standing in for an absent peer.
        expect(mod.getAsyncStorage()).toBeNull();
    });

    it.each([
        ["an ESM default export", (store: object) => ({ default: store })],
        ["a bare CJS module", (store: object) => store],
    ])("unwraps AsyncStorage shipped as %s", async (_shape, wrap) => {
        const store = { getItem: async () => null };
        const mod = await import("../src/platform/optionalModules.native");

        // vi.mock cannot reach the require() inside optional().
        const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
        const realLoad = loader._load;
        loader._load = function (request, ...rest) {
            return request === ASYNC_STORAGE ? wrap(store) : realLoad.call(this, request, ...rest);
        };
        try {
            expect(mod.getAsyncStorage()).toBe(store);
        }
        finally { loader._load = realLoad; }
    });

    it("exposes the same accessors as the web variant", async () => {
        const native = await import("../src/platform/optionalModules.native");
        const web = await import("../src/platform/optionalModules");

        // A drifting pair leaves one platform with an unresolved import at build time.
        for (const name of ACCESSORS) {
            expect(typeof native[name], `native.${name}`).toBe("function");
            expect(typeof web[name], `web.${name}`).toBe("function");
        }
    });
});

describe("optionalModules (web)", () => {
    it("reports every optional peer as absent", async () => {
        const web = await import("../src/platform/optionalModules");

        // None of these packages exist on web; callers take the module-absent path.
        for (const name of ACCESSORS) {
            expect(web[name](), `web.${name}()`).toBeNull();
        }
    });
});
