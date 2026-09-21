import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-device-info", () => ({ default: { getUserAgent: () => "test-ua" } }));
vi.mock("react-native", () => ({
    Platform: { OS: "ios" },
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
}));

const DATALAYER_KEY = "cheq.sst.datalayer";

function brokenDisk() {
    const data: Record<string, string> = {};
    return {
        getItem: vi.fn(async (k: string) => {
            if (k === DATALAYER_KEY) throw new Error("bridge down");
            return data[k] ?? null;
        }),
        setItem: vi.fn(async (k: string, v: string) => { data[k] = v; }),
        removeItem: vi.fn(async (k: string) => { delete data[k]; }),
        getMany: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(k => [k, data[k] ?? null]))),
        setMany: vi.fn(async () => {}),
        removeMany: vi.fn(async () => {}),
        getAllKeys: vi.fn(async () => Object.keys(data)),
        clear: vi.fn(async () => {}),
    };
}

let fetchMock: ReturnType<typeof vi.fn>;
let Sst: typeof import("../src/Sst")["Sst"];
let Config: typeof import("../src/Types")["Config"];
let Event: typeof import("../src/Models")["Event"];

beforeEach(async () => {
    vi.resetModules();
    const disk = brokenDisk();
    vi.doMock("../src/platform/optionalModules", async (importOriginal) => ({
        ...(await importOriginal<typeof import("../src/platform/optionalModules")>()),
        getAsyncStorage: () => disk,
    }));
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    ({ Sst } = await import("../src/Sst"));
    ({ Config } = await import("../src/Types"));
    ({ Event } = await import("../src/Models"));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../src/platform/optionalModules");
});

describe("data layer read failure during tracking", () => {
    it("still sends the event, without a dataLayer section", async () => {
        Sst.configure(new Config("testclient"));

        const result = await Sst.trackEvent(new Event("launch"));

        expect(result?.statusCode).toBe(200);
        const post = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.body);
        const body = JSON.parse((post![1] as RequestInit).body as string);
        expect(body.dataLayer.digitalData).toBeUndefined();
        expect(body.events[0].name).toBe("launch");

        const beacon = fetchMock.mock.calls.find(c => String(c[0]).includes("fn=DataLayer.getItem"));
        expect(beacon).toBeDefined();
        // A bridge outage is a storageError, not corrupt JSON.
        expect(String(beacon![0])).toContain("errorName=storageError");
    });

    it("keeps device data in the payload despite the failed read", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("launch"));

        const post = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.body);
        const body = JSON.parse((post![1] as RequestInit).body as string);
        expect(body.dataLayer.__mobileData).toBeDefined();
    });

    it("beacons a persistent bridge failure once, not once per event", async () => {
        Sst.configure(new Config("testclient"));

        for (let i = 0; i < 5; i++) await Sst.trackEvent(new Event(`e${i}`));

        const beacons = fetchMock.mock.calls.filter(c => String(c[0]).includes("/error/e.gif"));
        expect(beacons).toHaveLength(1);
    });

    it("still surfaces the failure to a direct dataLayer caller", async () => {
        Sst.configure(new Config("testclient"));

        await expect(Sst.dataLayer.all()).rejects.toThrow("bridge down");
    });
});
