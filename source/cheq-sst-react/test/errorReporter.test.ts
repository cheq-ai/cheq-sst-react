import { beforeEach, describe, expect, it, vi } from "vitest";

let mod: typeof import("../src/utils/errorReporter");
const reporter = vi.fn();

beforeEach(async () => {
    vi.resetModules();   // clears the module-level "already reported" set
    reporter.mockReset();
    mod = await import("../src/utils/errorReporter");
    mod.setErrorReporter(reporter);
});

describe("errorReporter", () => {
    it("forwards a report to the injected reporter", () => {
        mod.reportSstError("boom", "Some.fn", "networkError");

        expect(reporter).toHaveBeenCalledWith("boom", "Some.fn", "networkError");
    });

    it("reports a once-per-session condition only once", () => {
        for (let i = 0; i < 5; i++) {
            mod.reportSstErrorOnce("missingUserAgent", "no UA", "HTTP.getUserAgent", "missingUserAgent");
        }

        // Session-long conditions fire on every event; beaconing each one would flood.
        expect(reporter).toHaveBeenCalledOnce();
    });

    it("tracks once-keys independently", () => {
        mod.reportSstErrorOnce("a", "first", "fn", "networkError");
        mod.reportSstErrorOnce("b", "second", "fn", "networkError");
        mod.reportSstErrorOnce("a", "first again", "fn", "networkError");

        expect(reporter).toHaveBeenCalledTimes(2);
    });

    it("is a no-op before a reporter is injected", async () => {
        vi.resetModules();
        const fresh = await import("../src/utils/errorReporter");

        // Sst injects the reporter at configure(); calls before that must not throw.
        expect(() => fresh.reportSstError("early", "fn", "networkError")).not.toThrow();
    });
});
