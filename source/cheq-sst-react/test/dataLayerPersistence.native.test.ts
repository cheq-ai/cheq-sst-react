import { beforeEach, describe, expect, it, vi } from "vitest";

// Sst pulls in HTTP.native, which imports react-native modules that do not resolve under node.
vi.mock("react-native-device-info", () => ({ default: { getUserAgent: () => "test-ua" } }));
vi.mock("react-native", () => ({
    Platform: { OS: "ios" },
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
}));

const KEY = "cheq.sst.datalayer";

/** Stand-in for AsyncStorage shared across "launches" so persistence is a real assertion. */
function fakeDisk(seed: Record<string, string> = {}) {
    const data: Record<string, string> = { ...seed };
    return {
        data,
        getItem: vi.fn(async (k: string) => data[k] ?? null),
        setItem: vi.fn(async (k: string, v: string) => { data[k] = v; }),
    };
}

// A fresh module graph per import: the in-memory fallback dies with the JS process.
async function launch(store: ReturnType<typeof fakeDisk> | null) {
    vi.resetModules();
    vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => store }));
    const { DataLayer } = await import("../src/DataLayer");
    return new DataLayer();
}

beforeEach(() => { vi.resetModules(); vi.doUnmock("../src/platform/optionalModules"); });

describe("native data layer persistence", () => {
    it("increments launch_count across app restarts", async () => {
        const disk = fakeDisk();

        for (let expected = 1; expected <= 3; expected++) {
            const dataLayer = await launch(disk);
            const count = ((await dataLayer.get("launch_count")) as number | undefined) ?? 0;
            await dataLayer.add("launch_count", count + 1);
            expect(await dataLayer.get("launch_count")).toBe(expected);
        }

        expect(disk.setItem).toHaveBeenCalledWith(KEY, expect.stringContaining("launch_count"));
        expect(JSON.parse(JSON.parse(disk.data[KEY]).launch_count).value).toBe(3);
    });

    it("restores every value written by a previous launch", async () => {
        const disk = fakeDisk();
        const first = await launch(disk);
        await first.add("user", { id: "123", tier: "premium" });
        await first.add("route", "/checkout");

        const second = await launch(disk);
        expect(await second.all()).toEqual({ user: { id: "123", tier: "premium" }, route: "/checkout" });
    });

    it("removes and clears on disk, not just in memory", async () => {
        const disk = fakeDisk();
        const first = await launch(disk);
        await first.add("a", 1);
        await first.add("b", 2);
        expect(await first.remove("a")).toBe(true);

        expect(await (await launch(disk)).all()).toEqual({ b: 2 });

        await first.clear();
        expect(await (await launch(disk)).all()).toEqual({});
    });

    it("degrades to memory-only when the peer is absent", async () => {
        const first = await launch(null);
        await first.add("launch_count", 1);
        expect(await first.get("launch_count")).toBe(1);

        expect(await (await launch(null)).get("launch_count")).toBeUndefined();
    });

    it("resets to an empty domain when the persisted blob is not JSON", async () => {
        const disk = fakeDisk({ [KEY]: "not json" });
        const dataLayer = await launch(disk);

        expect(await dataLayer.all()).toEqual({});
        expect(await dataLayer.get("anything")).toBeUndefined();

        await dataLayer.add("fresh", 1);
        expect(await (await launch(disk)).all()).toEqual({ fresh: 1 });
    });

    it("reports a corrupt blob once per session, not once per read", async () => {
        const disk = fakeDisk({ [KEY]: "not json" });
        const dataLayer = await launch(disk);
        const { setErrorReporter } = await import("../src/utils/errorReporter");
        const reporter = vi.fn();
        setErrorReporter(reporter);

        await dataLayer.all();
        await dataLayer.get("anything");
        await dataLayer.all();

        expect(reporter).toHaveBeenCalledTimes(1);
        expect(reporter).toHaveBeenCalledWith(expect.stringContaining("corrupt storage"), "DataLayer.getDomain", "serializationError");
    });

    it("skips a corrupt entry but keeps the rest of the domain", async () => {
        const disk = fakeDisk({ [KEY]: JSON.stringify({ good: JSON.stringify({ value: 1 }), bad: "not json" }) });
        const dataLayer = await launch(disk);

        expect(await dataLayer.all()).toEqual({ good: 1 });
        expect(await dataLayer.get("bad")).toBeUndefined();
    });

    it("keeps both keys when concurrent adds overlap", async () => {
        const disk = fakeDisk();
        const dataLayer = await launch(disk);

        await Promise.all([dataLayer.add("a", 1), dataLayer.add("b", 2)]);

        expect(await dataLayer.all()).toEqual({ a: 1, b: 2 });
        expect(await (await launch(disk)).all()).toEqual({ a: 1, b: 2 });
    });

    it("reports a failing clear once, as a storage error", async () => {
        const reportSstError = vi.fn();
        const reportSstErrorOnce = vi.fn();
        vi.resetModules();
        const disk = fakeDisk();
        disk.setItem.mockRejectedValueOnce(new Error("disk full"));
        vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => disk }));
        vi.doMock("../src/utils/errorReporter", () => ({ reportSstError, reportSstErrorOnce }));
        const { DataLayer } = await import("../src/DataLayer");

        await expect(new DataLayer().clear()).rejects.toThrow("disk full");
        expect(reportSstErrorOnce).toHaveBeenCalledWith("dataLayerWriteFailed", expect.stringContaining("disk full"), "DataLayer.setItem", "storageError");
        expect(reportSstError).not.toHaveBeenCalled();

        vi.doUnmock("../src/utils/errorReporter");
    });

    it("reports an unserializable add as a serialization error", async () => {
        const reportSstError = vi.fn();
        const reportSstErrorOnce = vi.fn();
        vi.resetModules();
        const disk = fakeDisk();
        vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => disk }));
        vi.doMock("../src/utils/errorReporter", () => ({ reportSstError, reportSstErrorOnce }));
        const { DataLayer } = await import("../src/DataLayer");
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        await expect(new DataLayer().add("user", circular)).rejects.toThrow();
        expect(reportSstError).toHaveBeenCalledWith(expect.any(String), "Sst.dataLayer.add", "serializationError");
        expect(reportSstErrorOnce).not.toHaveBeenCalled();

        vi.doUnmock("../src/utils/errorReporter");
    });

    it("keeps accepting mutations after a failed write", async () => {
        const disk = fakeDisk();
        disk.setItem.mockRejectedValueOnce(new Error("disk full"));
        const dataLayer = await launch(disk);

        await expect(dataLayer.clear()).rejects.toThrow("disk full");

        await dataLayer.add("after", 1);
        expect(await dataLayer.get("after")).toBe(1);
        expect(JSON.parse(JSON.parse(disk.data[KEY]).after).value).toBe(1);
    });

    it("surfaces a failing read instead of returning an empty domain", async () => {
        const disk = fakeDisk();
        disk.getItem.mockRejectedValueOnce(new Error("bridge down"));
        const dataLayer = await launch(disk);

        await expect(dataLayer.get("launch_count")).rejects.toThrow("bridge down");
    });
});

// Matches Swift: the data layer is usable the moment the module loads.
describe("Sst.dataLayer without a prior configure()", () => {
    // configure() hydrates Storage, which needs more of the AsyncStorage surface than fakeDisk has.
    function fullDisk(seed: Record<string, string> = {}) {
        return {
            ...fakeDisk(seed),
            removeItem: vi.fn(async () => {}),
            getAllKeys: vi.fn(async () => [] as string[]),
            getMany: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(k => [k, null]))),
            setMany: vi.fn(async () => {}),
            removeMany: vi.fn(async () => {}),
            clear: vi.fn(async () => {}),
        };
    }

    async function launchSst(store: ReturnType<typeof fakeDisk>) {
        vi.resetModules();
        vi.doMock("../src/platform/optionalModules", async (importOriginal) => ({
            ...(await importOriginal<typeof import("../src/platform/optionalModules")>()),
            getAsyncStorage: () => store,
        }));
        const { Sst } = await import("../src/Sst");
        return Sst;
    }

    it("reads and writes before configure() is ever called", async () => {
        const disk = fakeDisk();
        const Sst = await launchSst(disk);

        await Sst.dataLayer.add("user", { id: "123", tier: "premium" });

        expect(await Sst.dataLayer.get("user")).toEqual({ id: "123", tier: "premium" });
        expect(await Sst.dataLayer.all()).toEqual({ user: { id: "123", tier: "premium" } });
        expect(disk.data[KEY]).toBeDefined();
    });

    it("persists those writes into a later launch", async () => {
        const disk = fakeDisk();
        await (await launchSst(disk)).dataLayer.add("route", "/checkout");

        expect(await (await launchSst(disk)).dataLayer.all()).toEqual({ route: "/checkout" });
    });

    it("delivers a pre-configure corrupt-blob report once configured", async () => {
        const Sst = await launchSst(fullDisk({ [KEY]: "not json" }));
        const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        expect(await Sst.dataLayer.get("anything")).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();

        const { Config } = await import("../src/Types");
        await Sst.configure(new Config("testclient"));

        await vi.waitFor(() => {
            const beacons = fetchMock.mock.calls.filter(c => String(c[0]).includes("fn=DataLayer.getDomain"));
            expect(beacons).toHaveLength(1);
        });
        vi.unstubAllGlobals();
    });

    it("dedupes a repeated pre-configure failure so one-shot reports still fit the buffer", async () => {
        const Sst = await launchSst(fullDisk({ [KEY]: "not json" }));
        const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const circular: Record<string, unknown> = {};
        circular.self = circular;
        for (let i = 0; i < 25; i++) {
            await expect(Sst.dataLayer.add("user", circular)).rejects.toThrow();
        }

        const { Config } = await import("../src/Types");
        await Sst.configure(new Config("testclient"));

        await vi.waitFor(() => {
            const beacons = fetchMock.mock.calls.map(c => String(c[0]));
            expect(beacons.filter(u => u.includes("fn=Sst.dataLayer.add"))).toHaveLength(1);
            expect(beacons.filter(u => u.includes("fn=DataLayer.getDomain"))).toHaveLength(1);
        });
        vi.unstubAllGlobals();
    });

    it("removes and clears before configure() is ever called", async () => {
        const disk = fakeDisk();
        const Sst = await launchSst(disk);
        await Sst.dataLayer.add("a", 1);
        await Sst.dataLayer.add("b", 2);

        expect(await Sst.dataLayer.remove("a")).toBe(true);
        expect(await Sst.dataLayer.all()).toEqual({ b: 2 });

        await Sst.dataLayer.clear();
        expect(await Sst.dataLayer.all()).toEqual({});
    });
});
