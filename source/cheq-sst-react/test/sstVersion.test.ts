import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config, Event, Sst } from "../src/index";

// The wire protocol version the collector expects. This suite exists so that
// dropping or altering it fails loudly rather than silently changing traffic.
const EXPECTED_SST_VERSION = "1.0.0";

let fetchMock: ReturnType<typeof vi.fn>;

function requestedUrl(callIndex = 0): URL {
    const call = fetchMock.mock.calls[callIndex];
    expect(call, `expected a fetch call at index ${callIndex}`).toBeDefined();
    return new URL(String(call[0]));
}

beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("sstVersion is present on the SST request URL", () => {
    it("is on the URL actually passed to fetch", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("pageview"));

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(requestedUrl().searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
    });

    it("is on the URL reported back in the trackEvent result", async () => {
        Sst.configure(new Config("testclient"));

        const result = await Sst.trackEvent(new Event("pageview"));

        expect(result).not.toBeNull();
        expect(new URL(result!.url).searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
        // The reported URL must match what went over the wire, or debugging lies to you.
        expect(result!.url).toBe(String(requestedUrl()));
    });

    it("appears exactly once, as a literal `?sstVersion=1.0.0` pair", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("pageview"));

        const url = requestedUrl();
        expect(url.searchParams.getAll("sstVersion")).toEqual([EXPECTED_SST_VERSION]);
        expect(url.search).toContain(`sstVersion=${EXPECTED_SST_VERSION}`);
    });

    it("survives every event name and custom parameter set", async () => {
        Sst.configure(new Config("testclient"));

        const events = [
            new Event("pageview"),
            new Event("purchase", { parameters: { orderId: "abc-123", currency: "USD" } }),
            new Event("custom", { data: { nested: { a: 1 } }, parameters: {} }),
        ];

        for (const event of events) {
            await Sst.trackEvent(event);
        }

        expect(fetchMock).toHaveBeenCalledTimes(events.length);
        for (let i = 0; i < events.length; i++) {
            expect(requestedUrl(i).searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
        }
    });

    it("survives non-default domain, clientName and publishPath config", async () => {
        Sst.configure(new Config("other-client_9", {
            domain: "custom.example.com",
            publishPath: "alt",
            dataLayerName: "myDataLayer",
            screenEnabled: false,
        }));

        await Sst.trackEvent(new Event("pageview"));

        const url = requestedUrl();
        expect(url.host).toBe("custom.example.com");
        expect(url.searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
    });

    it("is not clobbered by an event parameter of the same name", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("spoof", {
            parameters: { sstVersion: "9.9.9", sstOrigin: "web", sstPlatform: "fake", orderId: "abc-123" },
        }));

        const url = requestedUrl();
        // getAll, not get: a spoofed value appended after the canonical one is still a
        // duplicate, and anything reading the last occurrence would see the spoof.
        expect(url.searchParams.getAll("sstVersion")).toEqual([EXPECTED_SST_VERSION]);
        expect(url.searchParams.getAll("sstOrigin")).toEqual(["mobile"]);
        expect(url.searchParams.getAll("sstPlatform")).toHaveLength(1);
        expect(url.searchParams.get("sstPlatform")).not.toBe("fake");
        // Non-reserved parameters are untouched.
        expect(url.searchParams.get("orderId")).toBe("abc-123");
    });

    it("is not clobbered by a differently-cased event parameter", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("spoof", { parameters: { sstversion: "9.9.9", SSTORIGIN: "web" } }));

        const url = requestedUrl();
        expect(url.searchParams.getAll("sstVersion")).toEqual([EXPECTED_SST_VERSION]);
        // A collector that lowercases parameter names must not see the spoofed value at all.
        expect(url.search.toLowerCase()).not.toContain("9.9.9");
        expect(url.search.toLowerCase()).not.toContain("sstorigin=web");
    });
});
