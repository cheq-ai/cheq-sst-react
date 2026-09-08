import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocalizeMock = vi.fn();
const getExpoLocalizationMock = vi.fn();

vi.mock("../src/platform/optionalModules", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getLocalize: getLocalizeMock,
    getExpoLocalization: getExpoLocalizationMock,
}));

const dimensions = { get: vi.fn(() => ({ width: 402, height: 874 })) };
vi.mock("react-native", () => ({ Dimensions: dimensions }));

let vb: typeof import("../src/platform/virtualBrowser");

beforeEach(async () => {
    vi.resetModules();
    getLocalizeMock.mockReset().mockReturnValue(null);
    getExpoLocalizationMock.mockReset().mockReturnValue(null);
    vb = await import("../src/platform/virtualBrowser");
});

describe("getLanguage", () => {
    it("prefers react-native-localize", async () => {
        getLocalizeMock.mockReturnValue({ getLocales: () => [{ languageTag: "en-GB" }] });
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => [{ languageTag: "fr-FR" }] });

        expect(vb.getLanguage()).toBe("en-GB");
    });

    it("falls back to expo-localization when localize is absent", async () => {
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => [{ languageTag: "fr-FR" }] });

        expect(vb.getLanguage()).toBe("fr-FR");
    });

    it("falls back to expo when an INSTALLED localize throws", async () => {
        // The bug this rewrite fixed: the old nested catch read a throw here as
        // "not installed" and fell through, so both paths looked identical.
        getLocalizeMock.mockReturnValue({ getLocales: () => { throw new Error("bridge down"); } });
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => [{ languageTag: "fr-FR" }] });

        expect(vb.getLanguage()).toBe("fr-FR");
    });

    it("falls back when localize returns an empty locale list", async () => {
        getLocalizeMock.mockReturnValue({ getLocales: () => [] });
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => [{ languageTag: "fr-FR" }] });

        expect(vb.getLanguage()).toBe("fr-FR");
    });

    it("falls back when localize returns an empty languageTag", async () => {
        // An empty tag used to count as success, skipping the remaining source.
        getLocalizeMock.mockReturnValue({ getLocales: () => [{ languageTag: "" }] });
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => [{ languageTag: "fr-FR" }] });

        expect(vb.getLanguage()).toBe("fr-FR");
    });

    it("returns empty string when no source can supply one", async () => {
        expect(vb.getLanguage()).toBe("");
    });

    it("returns empty string when both sources throw", async () => {
        getLocalizeMock.mockReturnValue({ getLocales: () => { throw new Error("a"); } });
        getExpoLocalizationMock.mockReturnValue({ getLocales: () => { throw new Error("b"); } });

        expect(vb.getLanguage()).toBe("");
    });
});

describe("getTimezone", () => {
    it("prefers react-native-localize", async () => {
        getLocalizeMock.mockReturnValue({ getTimeZone: () => "Europe/London" });

        expect(vb.getTimezone()).toBe("Europe/London");
    });

    it("reads expo's timezone from getCalendars, not a `timezone` property", async () => {
        // expo-localization removed its `timezone` export; reading it silently yielded "".
        getExpoLocalizationMock.mockReturnValue({
            timezone: "Should/NotBeUsed",
            getCalendars: () => [{ timeZone: "America/New_York" }],
        });

        expect(vb.getTimezone()).toBe("America/New_York");
    });

    it("falls back to expo when an INSTALLED localize throws", async () => {
        getLocalizeMock.mockReturnValue({ getTimeZone: () => { throw new Error("bridge down"); } });
        getExpoLocalizationMock.mockReturnValue({ getCalendars: () => [{ timeZone: "America/New_York" }] });

        expect(vb.getTimezone()).toBe("America/New_York");
    });

    it("falls back when localize returns an empty timezone", async () => {
        getLocalizeMock.mockReturnValue({ getTimeZone: () => "" });
        getExpoLocalizationMock.mockReturnValue({ getCalendars: () => [{ timeZone: "America/New_York" }] });

        expect(vb.getTimezone()).toBe("America/New_York");
    });

    it("returns empty string when expo reports a null timeZone", async () => {
        // Calendar.timeZone is `string | null` upstream.
        getExpoLocalizationMock.mockReturnValue({ getCalendars: () => [{ timeZone: null }] });

        expect(vb.getTimezone()).toBe("");
    });

    it("returns empty string when no source can supply one", async () => {
        expect(vb.getTimezone()).toBe("");
    });
});

describe("web-only fields are inert on native", () => {
    it("returns empty strings for page url, title and referrer", async () => {
        expect([vb.getPageURL(), vb.getPageTitle(), vb.getReferrer()]).toEqual(["", "", ""]);
    });
});
