import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// HTTP.native.ts imports react-native modules that do not resolve under node.
vi.mock("react-native-device-info", () => ({ default: { getUserAgent: () => "test-ua" } }));
vi.mock("react-native", () => ({
    Platform: { OS: "ios" },
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
}));

const UUID = "e255d5bb-d612-4630-af26-dfde184660d4";
const UUID_KEY = "cheq.sst.http:uuid";
const COOKIE_KEY = "cheq.sst.storage.cookie:persisted_cookie";
const LOCAL_KEY = "cheq.sst.storage.local:persisted_local";

// Reads take time, as on the real bridge; a microtask-fast fake hides the cold-start race.
const io = () => new Promise<void>(r => setTimeout(r, 10));

function fakeDisk(seed: Record<string, string>) {
    const data: Record<string, string> = { ...seed };
    return {
        getItem: vi.fn(async (k: string) => data[k] ?? null),
        setItem: vi.fn(async (k: string, v: string) => { data[k] = v; }),
        removeItem: vi.fn(async (k: string) => { delete data[k]; }),
        getMany: vi.fn(async (keys: string[]) => {
            await io();
            return Object.fromEntries(keys.map(k => [k, data[k] ?? null]));
        }),
        setMany: vi.fn(async () => {}),
        removeMany: vi.fn(async (keys: string[]) => { for (const k of keys) delete data[k]; }),
        getAllKeys: vi.fn(async () => { await io(); return Object.keys(data); }),
        clear: vi.fn(async () => {}),
    };
}

let fetchMock: ReturnType<typeof vi.fn>;
let Sst: typeof import("../src/Sst")["Sst"];
let Config: typeof import("../src/Types")["Config"];
let Event: typeof import("../src/Models")["Event"];

beforeEach(async () => {
    vi.resetModules();
    const disk = fakeDisk({
        [UUID_KEY]: UUID,
        [COOKIE_KEY]: "from-disk",
        [LOCAL_KEY]: "also-from-disk",
    });
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

function sentBody(): Record<string, any> {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string);
}

describe("native cold start", () => {
    it("ships persisted storage in the first event fired right after configure()", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("launch"));

        expect(sentBody().storage).toEqual({
            cookies: [{ name: "persisted_cookie", value: "from-disk" }],
            localStorage: [{ key: "persisted_local", value: "also-from-disk" }],
        });
        const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(headers["Cookie"]).toBe(`uuid=${UUID}`);
    });

    it("keeps device data but omits the namespace when the data layer is empty", async () => {
        Sst.configure(new Config("testclient"));

        await Sst.trackEvent(new Event("launch"));

        const dataLayer = sentBody().dataLayer;
        expect(dataLayer.digitalData).toBeUndefined();
        expect(dataLayer.__mobileData).toBeDefined();
    });

    it("exposes the identity through getCheqUuid() once configure() resolves", async () => {
        const ready = Sst.configure(new Config("testclient"));

        expect(Sst.getCheqUuid()).toBeNull();
        await ready;
        expect(Sst.getCheqUuid()).toBe(UUID);
    });

    it("still throws synchronously on an invalid config", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => Sst.configure(new Config("bad client!"))).toThrow();
    });
});
