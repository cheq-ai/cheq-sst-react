import { beforeEach, describe, expect, it, vi } from "vitest";

const UUID = "e255d5bb-d612-4630-af26-dfde184660d4";
const UUID_KEY = "cheq.sst.http:uuid";

// Removals take time, as on the real bridge; a synchronous fake hides the in-flight races.
const io = () => new Promise<void>(r => setTimeout(r, 10));

/** Stand-in for AsyncStorage, so "survives a restart" is a real assertion. */
function fakeDisk(seed: Record<string, string> = {}) {
    const data: Record<string, string> = { ...seed };
    return {
        data,
        getItem: vi.fn(async (k: string) => data[k] ?? null),
        setItem: vi.fn(async (k: string, v: string) => { data[k] = v; }),
        removeItem: vi.fn(async (k: string) => { await io(); delete data[k]; }),
        getMany: vi.fn(async (keys: string[]) =>
            Object.fromEntries(keys.map(k => [k, data[k] ?? null]))),
        setMany: vi.fn(async () => {}),
        removeMany: vi.fn(async (keys: string[]) => { await io(); for (const k of keys) delete data[k]; }),
        getAllKeys: vi.fn(async () => Object.keys(data)),
        clear: vi.fn(async () => { for (const k of Object.keys(data)) delete data[k]; }),
    };
}

/** AsyncStorage v1/v2 shape: multiGet/multiRemove, no getMany. */
function legacyDisk(seed: Record<string, string> = {}) {
    const data: Record<string, string> = { ...seed };
    return {
        data,
        getItem: vi.fn(async (k: string) => data[k] ?? null),
        setItem: vi.fn(async (k: string, v: string) => { data[k] = v; }),
        removeItem: vi.fn(async (k: string) => { delete data[k]; }),
        multiGet: vi.fn(async (keys: readonly string[]) =>
            keys.map(k => [k, data[k] ?? null] as const)),
        multiRemove: vi.fn(async (keys: readonly string[]) => { for (const k of keys) delete data[k]; }),
        getAllKeys: vi.fn(async () => Object.keys(data)),
    };
}

let disk: ReturnType<typeof fakeDisk>;

const reporter = vi.fn();

async function loadStorage(seed: Record<string, string> = {}) {
    vi.resetModules();
    reporter.mockReset();
    disk = fakeDisk(seed);
    // Storage.native imports the accessor, so mocking it covers the "peer installed" path.
    vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => disk }));
    const storage = await import("../src/Storage.native");
    (await import("../src/utils/errorReporter")).setErrorReporter(reporter);
    return storage;
}

beforeEach(() => { vi.resetModules(); vi.doUnmock("../src/platform/optionalModules"); });

describe("native storage persistence", () => {
    it("restores a uuid written by a previous app launch", async () => {
        const storage = await loadStorage({ [UUID_KEY]: UUID });

        expect(storage.getUUID()).toBeNull();   // not yet hydrated
        await storage.hydrateStorage();

        // This is the divergence from Swift/Kotlin that the change closes.
        expect(storage.getUUID()).toBe(UUID);
    });

    it("writes the uuid through so the next launch can restore it", async () => {
        const storage = await loadStorage();
        await storage.hydrateStorage();

        storage.setStorageItem(UUID_KEY, UUID);
        await vi.waitFor(() => expect(disk.setItem).toHaveBeenCalledWith(UUID_KEY, UUID));
        expect(disk.data[UUID_KEY]).toBe(UUID);
    });

    it("removes the uuid from disk when cleared", async () => {
        const storage = await loadStorage({ [UUID_KEY]: UUID });
        await storage.hydrateStorage();

        storage.clearUUID();

        expect(storage.getUUID()).toBeNull();
        // Clearing only memory would let the next launch restore the old identity.
        await vi.waitFor(() => expect(disk.data[UUID_KEY]).toBeUndefined());
    });

    it("persists the cookie/localStorage/sessionStorage classes too", async () => {
        const storage = await loadStorage();
        await storage.hydrateStorage();

        new storage.Cookies().add("cookie_test", "1");
        new storage.LocalStorage().add("ls_test", "world");

        await vi.waitFor(() => {
            expect(disk.data["cheq.sst.storage.cookie:cookie_test"]).toBe("1");
            expect(disk.data["cheq.sst.storage.local:ls_test"]).toBe("world");
        });
    });

    it("leaves keys outside the SDK namespace untouched", async () => {
        const storage = await loadStorage({ "host.app.key": "theirs", [UUID_KEY]: UUID });
        await storage.hydrateStorage();

        // Hydration must not adopt, and writes must not evict, the host app's own keys.
        expect(storage.getStorageItem("host.app.key")).toBeNull();
        expect(disk.getMany).toHaveBeenCalledWith([UUID_KEY]);
    });

    it("hydrates once even when awaited repeatedly", async () => {
        const storage = await loadStorage({ [UUID_KEY]: UUID });

        await Promise.all([storage.hydrateStorage(), storage.hydrateStorage()]);
        await storage.hydrateStorage();

        expect(disk.getAllKeys).toHaveBeenCalledOnce();
    });

    it.each([
        ["getAllKeys", (d: ReturnType<typeof fakeDisk>) => d.getAllKeys],
        ["getMany", (d: ReturnType<typeof fakeDisk>) => d.getMany],
    ])("degrades to memory-only when %s rejects, instead of failing every send", async (_name, pick) => {
        const storage = await loadStorage({ [UUID_KEY]: UUID });
        pick(disk).mockRejectedValueOnce(new Error("native module unavailable"));

        await expect(storage.hydrateStorage()).resolves.toBeUndefined();
        await expect(storage.hydrateStorage()).resolves.toBeUndefined();

        expect(storage.getUUID()).toBeNull();
        storage.setStorageItem(UUID_KEY, UUID);
        expect(storage.getUUID()).toBe(UUID);
        await vi.waitFor(() => expect(disk.setItem).toHaveBeenCalledWith(UUID_KEY, UUID));

        expect(reporter).toHaveBeenCalledOnce();
        expect(reporter.mock.calls[0][0]).toContain("native module unavailable");
        expect(reporter.mock.calls[0].slice(1)).toEqual(["Storage.hydrateStorage", "storageError"]);
    });

    it("beacons a failing write once per session, not once per event", async () => {
        const storage = await loadStorage();
        await storage.hydrateStorage();
        disk.setItem.mockRejectedValue(new Error("quota exceeded"));

        for (let i = 0; i < 5; i++) storage.setStorageItem(UUID_KEY, UUID);

        expect(storage.getUUID()).toBe(UUID);
        await vi.waitFor(() => expect(reporter).toHaveBeenCalledOnce());
        expect(reporter.mock.calls[0][0]).toContain("quota exceeded");
        expect(reporter.mock.calls[0].slice(1)).toEqual(["Storage.writeThrough", "storageError"]);
    });

    it("does not overwrite a value written while hydration was in flight", async () => {
        const storage = await loadStorage({ [UUID_KEY]: "11112222-3333-4444-5555-666677778888" });

        const inFlight = storage.hydrateStorage();
        storage.setStorageItem(UUID_KEY, UUID);   // newer than what is on disk
        await inFlight;

        expect(storage.getUUID()).toBe(UUID);
    });

    it("does not resurrect a uuid cleared while hydration was in flight", async () => {
        const storage = await loadStorage({ [UUID_KEY]: UUID });

        const inFlight = storage.hydrateStorage();
        storage.clearUUID();
        await inFlight;

        expect(storage.getUUID()).toBeNull();
        await vi.waitFor(() => expect(disk.data[UUID_KEY]).toBeUndefined());
    });

    it("does not resurrect a namespace cleared while hydration was in flight", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1", [UUID_KEY]: UUID });

        const inFlight = storage.hydrateStorage();
        new storage.Cookies().add("c", "2");
        new storage.Cookies().clear();
        await inFlight;

        expect(new storage.Cookies().all()).toEqual({});
        expect(storage.getUUID()).toBe(UUID);
    });

    it("clears a namespace that was never hydrated, in memory and on disk", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1", [UUID_KEY]: UUID });

        new storage.Cookies().clear();
        await storage.hydrateStorage();

        expect(new storage.Cookies().all()).toEqual({});
        expect(storage.getUUID()).toBe(UUID);
        await vi.waitFor(() => expect(disk.data["cheq.sst.storage.cookie:c"]).toBeUndefined());
        expect(disk.data[UUID_KEY]).toBe(UUID);
    });

    it("clears persisted keys after a failed hydration", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1" });
        disk.getAllKeys.mockRejectedValueOnce(new Error("bridge down"));
        await storage.hydrateStorage();
        expect(new storage.Cookies().all()).toEqual({});

        new storage.Cookies().clear();

        await vi.waitFor(() => expect(disk.data["cheq.sst.storage.cookie:c"]).toBeUndefined());
    });

    it("still removes cached keys from disk when the key scan fails during clear()", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1" });
        await storage.hydrateStorage();
        disk.getAllKeys.mockRejectedValueOnce(new Error("bridge down"));

        new storage.Cookies().clear();

        await vi.waitFor(() => expect(disk.data["cheq.sst.storage.cookie:c"]).toBeUndefined());
        // A failing scan leaves cache-invisible keys behind, so it must reach Sentry, not just debug().
        await vi.waitFor(() => expect(reporter).toHaveBeenCalledOnce());
        expect(reporter.mock.calls[0][0]).toContain("bridge down");
        expect(reporter.mock.calls[0].slice(1)).toEqual(["Storage.clear", "storageError"]);
    });

    it("takes the same fallback path when the key scan throws synchronously during clear()", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1" });
        await storage.hydrateStorage();
        // A malformed peer can throw synchronously (or return a non-thenable); .catch alone misses this.
        disk.getAllKeys.mockImplementationOnce(() => { throw new Error("no such method"); });

        new storage.Cookies().clear();

        await vi.waitFor(() => expect(disk.data["cheq.sst.storage.cookie:c"]).toBeUndefined());
        await vi.waitFor(() => expect(reporter).toHaveBeenCalledOnce());
        expect(reporter.mock.calls[0][0]).toContain("no such method");
        expect(reporter.mock.calls[0].slice(1)).toEqual(["Storage.clear", "storageError"]);
    });

    it("keeps a value re-added after clear() while the disk removal is in flight", async () => {
        const storage = await loadStorage({ "cheq.sst.storage.cookie:c": "1" });
        await storage.hydrateStorage();

        new storage.Cookies().clear();
        new storage.Cookies().add("c", "2");

        await vi.waitFor(() => expect(disk.getAllKeys).toHaveBeenCalledTimes(2));
        await io();
        expect(disk.removeMany).not.toHaveBeenCalled();
        expect(new storage.Cookies().all()).toEqual({ c: "2" });
        expect(disk.data["cheq.sst.storage.cookie:c"]).toBe("2");
    });

    it("lets a value set after an in-flight removal win over both", async () => {
        const storage = await loadStorage({ [UUID_KEY]: "11112222-3333-4444-5555-666677778888" });

        const inFlight = storage.hydrateStorage();
        storage.clearUUID();
        storage.setStorageItem(UUID_KEY, UUID);
        await inFlight;

        expect(storage.getUUID()).toBe(UUID);
    });

    it("keeps the write in memory when the store throws synchronously", async () => {
        vi.resetModules();
        // A store whose method throws before returning a promise (e.g. a bad module shape) must
        // not propagate out of setStorageItem and into trackEvent.
        vi.doMock("../src/platform/optionalModules", () => ({
            getAsyncStorage: () => ({ setItem: () => { throw new Error("boom"); } }),
        }));
        const storage = await import("../src/Storage.native");

        const spy = vi.fn();
        (await import("../src/utils/errorReporter")).setErrorReporter(spy);

        expect(() => storage.setStorageItem(UUID_KEY, UUID)).not.toThrow();
        expect(storage.getUUID()).toBe(UUID);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("boom"), "Storage.writeThrough", "storageError");
    });

    it("hydrates and clears through the v1/v2 multiGet/multiRemove API", async () => {
        vi.resetModules();
        const legacy = legacyDisk({ [UUID_KEY]: UUID, "cheq.sst.storage.cookie:c": "1" });
        vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => legacy }));
        const storage = await import("../src/Storage.native");

        await storage.hydrateStorage();
        expect(storage.getUUID()).toBe(UUID);
        expect(new storage.Cookies().all()).toEqual({ c: "1" });
        expect(legacy.multiGet).toHaveBeenCalledOnce();

        new storage.Cookies().clear();
        await vi.waitFor(() => expect(legacy.multiRemove).toHaveBeenCalledWith(["cheq.sst.storage.cookie:c"]));
        expect(legacy.data["cheq.sst.storage.cookie:c"]).toBeUndefined();
        expect(legacy.data[UUID_KEY]).toBe(UUID);
    });

    it("keeps the write in memory when the store returns a non-promise", async () => {
        vi.resetModules();
        vi.doMock("../src/platform/optionalModules", () => ({
            getAsyncStorage: () => ({ setItem: () => undefined }),
        }));
        const storage = await import("../src/Storage.native");
        const spy = vi.fn();
        (await import("../src/utils/errorReporter")).setErrorReporter(spy);

        expect(() => storage.setStorageItem(UUID_KEY, UUID)).not.toThrow();
        expect(storage.getUUID()).toBe(UUID);
        expect(spy).toHaveBeenCalledWith(expect.any(String), "Storage.writeThrough", "storageError");
    });

    it("degrades to memory-only when the peer is absent", async () => {
        vi.resetModules();
        vi.doMock("../src/platform/optionalModules", () => ({ getAsyncStorage: () => null }));
        const storage = await import("../src/Storage.native");

        await expect(storage.hydrateStorage()).resolves.toBeUndefined();
        storage.setStorageItem(UUID_KEY, UUID);
        expect(storage.getUUID()).toBe(UUID);
    });
});
