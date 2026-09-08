import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getUserAgent reads an optional peer, so mock at the optionalModules seam -- it is a normal
 * ESM import, unlike the require() inside optionalModules itself, which vi.mock cannot reach.
 */
const getDeviceInfo = vi.fn();
vi.mock("../src/platform/optionalModules", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getDeviceInfo,
}));

const platform = { OS: "android" };
vi.mock("react-native", () => ({ Platform: platform }));

const reportSstErrorOnce = vi.fn();
vi.mock("../src/utils/errorReporter", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    reportSstErrorOnce,
}));

let sendHttpPost: typeof import("../src/platform/HTTP")["sendHttpPost"];
let fetchMock: ReturnType<typeof vi.fn>;

const sentHeaders = () =>
    (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;

beforeEach(async () => {
    vi.resetModules();
    getDeviceInfo.mockReset();
    reportSstErrorOnce.mockReset();
    platform.OS = "android";
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    ({ sendHttpPost } = await import("../src/platform/HTTP"));
});

const post = () => sendHttpPost({ url: "https://example.com/sst", jsonString: "{}" });

describe("getUserAgent", () => {
    it.each(["android", "ios"])("sends the device User-Agent on %s", async (os) => {
        platform.OS = os;
        getDeviceInfo.mockReturnValue({ getUserAgent: async () => "device-ua" });

        await post();

        expect(sentHeaders()["User-Agent"]).toBe("device-ua");
    });

    it.each(["android", "ios"])("still sends the event when getUserAgent rejects on %s", async (os) => {
        platform.OS = os;
        getDeviceInfo.mockReturnValue({ getUserAgent: async () => { throw new Error("bridge down"); } });

        // Without `await` on the platform branch the rejection escapes the catch and aborts
        // the whole POST -- an optional dependency failing must never lose the event.
        await expect(post()).resolves.toBe(200);
        expect(sentHeaders()["User-Agent"]).toBeUndefined();
    });

    it("sends the event with no User-Agent when the peer is absent", async () => {
        getDeviceInfo.mockReturnValue(null);

        await expect(post()).resolves.toBe(200);
        expect(sentHeaders()["User-Agent"]).toBeUndefined();
    });

    it("beacons a missing User-Agent, which reads as a bot signature at the collector", async () => {
        getDeviceInfo.mockReturnValue(null);

        await post();
        await post();

        // debug() is off in production, so this needs the error beacon -- once, not per event.
        expect(reportSstErrorOnce).toHaveBeenCalledTimes(2);
        expect(reportSstErrorOnce.mock.calls[0][3]).toBe("missingUserAgent");
    });

    it("beacons a throwing peer too: an installed-but-broken bridge loses the User-Agent just the same", async () => {
        getDeviceInfo.mockReturnValue({ getUserAgent: async () => { throw new Error("bridge down"); } });

        await post();

        expect(reportSstErrorOnce).toHaveBeenCalledOnce();
        const [key, msg, fn, kind] = reportSstErrorOnce.mock.calls[0];
        expect(key).toBe("userAgentThrew");
        expect(msg).toContain("bridge down");
        expect(fn).toBe("HTTP.getUserAgent");
        expect(kind).toBe("missingUserAgent");
    });

    it("does not beacon when the peer is present", async () => {
        getDeviceInfo.mockReturnValue({ getUserAgent: async () => "device-ua" });

        await post();

        expect(reportSstErrorOnce).not.toHaveBeenCalled();
    });

    it("prefers an explicitly configured userAgent over the device one", async () => {
        getDeviceInfo.mockReturnValue({ getUserAgent: async () => "device-ua" });

        await sendHttpPost({ url: "https://example.com/sst", jsonString: "{}", userAgent: "configured-ua" });

        expect(sentHeaders()["User-Agent"]).toBe("configured-ua");
        expect(getDeviceInfo).not.toHaveBeenCalled();
    });
});
