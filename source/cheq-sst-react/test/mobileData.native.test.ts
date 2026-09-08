import { beforeEach, describe, expect, it, vi } from "vitest";

const getExpoTT = vi.fn();
const getRNTT = vi.fn();
const getDeviceInfo = vi.fn();

vi.mock("../src/platform/optionalModules", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getExpoTrackingTransparency: getExpoTT,
    getRNTrackingTransparency: getRNTT,
    getDeviceInfo,
}));

const platform: { OS: string; Version?: unknown } = { OS: "ios", Version: "18.5" };
const nativeModules: Record<string, unknown> = {};
vi.mock("react-native", () => ({
    Platform: platform,
    NativeModules: nativeModules,
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
}));

let md: typeof import("../src/platform/mobileData");

beforeEach(async () => {
    vi.resetModules();   // also resets the module-level ATT cache
    getExpoTT.mockReset().mockReturnValue(null);
    getRNTT.mockReset().mockReturnValue(null);
    getDeviceInfo.mockReset().mockReturnValue(null);
    platform.OS = "ios";
    platform.Version = "18.5";
    for (const k of Object.keys(nativeModules)) delete nativeModules[k];
    md = await import("../src/platform/mobileData");
});

/** getMobileData returns {} on failure, so narrow to the populated shape for assertions. */
type MobileData = { app?: Record<string, string>; device?: Record<string, any>; advertising?: unknown };
const collect = async (hasAdvertising: boolean): Promise<MobileData> =>
    md.getMobileData(configWith(hasAdvertising)) as Promise<MobileData>;

/** Minimal config stub; only models.hasAdvertising() is consulted. */
const configWith = (hasAdvertising: boolean) =>
    ({ models: { hasAdvertising: () => hasAdvertising } }) as unknown as
        Parameters<typeof md.getMobileData>[0];

describe("getTrackingAuthorizationStatus", () => {
    it("reports authorized on android without consulting any ATT library", async () => {
        platform.OS = "android";

        await expect(md.getTrackingAuthorizationStatus()).resolves.toBe("authorized");
        expect(getExpoTT).not.toHaveBeenCalled();
    });

    it("prefers expo-tracking-transparency", async () => {
        getExpoTT.mockReturnValue({ getTrackingPermissionsAsync: async () => ({ status: "granted" }) });
        getRNTT.mockReturnValue({ getTrackingStatus: async () => "denied" });

        await expect(md.getTrackingAuthorizationStatus()).resolves.toBe("authorized");
    });

    it.each([
        ["getTrackingStatus"],
        ["getTrackingAuthorizationStatus"],
        ["getTrackingPermissionStatus"],
    ])("accepts the react-native library's %s naming", async (method) => {
        getRNTT.mockReturnValue({ [method]: async () => "authorized" });

        await expect(md.getTrackingAuthorizationStatus()).resolves.toBe("authorized");
    });

    it.each([
        ["granted", "authorized"],
        ["authorized", "authorized"],
        ["denied", "denied"],
        ["restricted", "restricted"],
        ["notDetermined", "notDetermined"],
        ["not-determined", "notDetermined"],
        ["undetermined", "notDetermined"],
        ["unavailable", "unavailable"],
        ["something-unexpected", "unavailable"],
    ])("normalizes %s to %s", async (raw, expected) => {
        getExpoTT.mockReturnValue({ getTrackingPermissionsAsync: async () => ({ status: raw }) });

        await expect(md.getTrackingAuthorizationStatus()).resolves.toBe(expected);
    });

    it("reports unavailable when no ATT library is installed", async () => {
        await expect(md.getTrackingAuthorizationStatus()).resolves.toBe("unavailable");
    });
});

describe("getAdvertisingAuthorization", () => {
    it("returns true on android without prompting", async () => {
        platform.OS = "android";

        await expect(md.getAdvertisingAuthorization()).resolves.toBe(true);
        expect(getExpoTT).not.toHaveBeenCalled();
    });

    it("prompts via expo and caches the result", async () => {
        const request = vi.fn(async () => ({ status: "granted" }));
        getExpoTT.mockReturnValue({ requestTrackingPermissionsAsync: request });

        await expect(md.getAdvertisingAuthorization()).resolves.toBe(true);
        await expect(md.getAdvertisingAuthorization()).resolves.toBe(true);

        // Caching matters: each call would otherwise re-prompt the user.
        expect(request).toHaveBeenCalledOnce();
    });

    it("serializes concurrent calls into a single prompt", async () => {
        const request = vi.fn(async () => ({ status: "granted" }));
        getExpoTT.mockReturnValue({ requestTrackingPermissionsAsync: request });

        const results = await Promise.all([
            md.getAdvertisingAuthorization(),
            md.getAdvertisingAuthorization(),
            md.getAdvertisingAuthorization(),
        ]);

        expect(results).toEqual([true, true, true]);
        expect(request).toHaveBeenCalledOnce();
    });

    it("returns false and does not cache when the prompt throws", async () => {
        const request = vi.fn(async () => { throw new Error("prompt failed"); });
        getExpoTT.mockReturnValue({ requestTrackingPermissionsAsync: request });

        await expect(md.getAdvertisingAuthorization()).resolves.toBe(false);

        // A failure must stay retryable rather than sticking as a denial for the session.
        getExpoTT.mockReturnValue({ requestTrackingPermissionsAsync: async () => ({ status: "granted" }) });
        await expect(md.getAdvertisingAuthorization()).resolves.toBe(true);
    });

    it("falls back to reading current status when it cannot prompt", async () => {
        getRNTT.mockReturnValue({ getTrackingStatus: async () => "authorized" });

        await expect(md.getAdvertisingAuthorization()).resolves.toBe(true);
    });

    it("returns false when denied", async () => {
        getExpoTT.mockReturnValue({ requestTrackingPermissionsAsync: async () => ({ status: "denied" }) });

        await expect(md.getAdvertisingAuthorization()).resolves.toBe(false);
    });
});

describe("getAdvertisingId", () => {
    it("prefers the native AdvertisingId module", async () => {
        nativeModules.AdvertisingId = { getAdvertisingId: async () => ({ advertisingId: "native-id" }) };
        getExpoTT.mockReturnValue({ getAdvertisingId: async () => "expo-id" });

        await expect(md.getAdvertisingId()).resolves.toBe("native-id");
    });

    it("falls back to expo when the native module is absent", async () => {
        getExpoTT.mockReturnValue({ getAdvertisingId: async () => "expo-id" });

        await expect(md.getAdvertisingId()).resolves.toBe("expo-id");
    });

    it("falls back to expo when the native module throws", async () => {
        nativeModules.AdvertisingId = { getAdvertisingId: async () => { throw new Error("bridge down"); } };
        getExpoTT.mockReturnValue({ getAdvertisingId: async () => "expo-id" });

        await expect(md.getAdvertisingId()).resolves.toBe("expo-id");
    });

    it("returns null when the native module yields no id", async () => {
        nativeModules.AdvertisingId = { getAdvertisingId: async () => ({}) };

        await expect(md.getAdvertisingId()).resolves.toBeNull();
    });

    it("maps an empty expo id to null rather than an empty string", async () => {
        getExpoTT.mockReturnValue({ getAdvertisingId: async () => "" });

        await expect(md.getAdvertisingId()).resolves.toBeNull();
    });

    it("returns null when neither source is available", async () => {
        await expect(md.getAdvertisingId()).resolves.toBeNull();
    });
});

describe("getMobileData", () => {
    const fullDeviceInfo = {
        getApplicationName: () => "Demo",
        getVersion: () => "1.2.3",
        getBuildNumber: () => "42",
        getBundleId: () => "com.example.demo",
        getManufacturer: async () => "Apple",
        supportedAbis: async () => ["arm64-v8a"],
        getModel: () => "iPhone15,2",
        getUniqueIdSync: () => "device-123",
    };

    it("collects app and device fields from react-native-device-info", async () => {
        getDeviceInfo.mockReturnValue(fullDeviceInfo);

        const data = await collect(false);

        expect(data.app).toEqual({
            name: "Demo", version: "1.2.3", build: "42", namespace: "com.example.demo",
        });
        expect(data.device).toMatchObject({
            manufacturer: "apple",       // lowercased
            model: "iPhone15,2",
            architecture: "arm64",
            id: "device-123",
            os: { name: "iOS", version: "18.5" },
        });
    });

    it("falls back to \"unknown\" for every field when the peer is absent", async () => {
        const data = await collect(false);

        expect(data.app).toEqual({
            name: "unknown", version: "unknown", build: "unknown", namespace: "unknown",
        });
        expect(data.device).toMatchObject({
            manufacturer: "unknown", model: "unknown", architecture: "unknown", id: "unknown",
        });
    });

    it("omits the advertising block when the model is not enabled", async () => {
        getDeviceInfo.mockReturnValue(fullDeviceInfo);
        getExpoTT.mockReturnValue({ getTrackingPermissionsAsync: async () => ({ status: "granted" }) });

        const data = await collect(false);

        // Not merely null -- the key must be absent, and ATT must not be consulted.
        expect(data).not.toHaveProperty("advertising");
        expect(getExpoTT).not.toHaveBeenCalled();
    });

    it("includes the advertising id once authorized", async () => {
        getDeviceInfo.mockReturnValue(fullDeviceInfo);
        getExpoTT.mockReturnValue({
            getTrackingPermissionsAsync: async () => ({ status: "granted" }),
            getAdvertisingId: async () => "expo-id",
        });

        const data = await collect(true);

        expect(data.advertising).toEqual({ authorized: true, id: "expo-id" });
    });

    it("does not read the advertising id when ATT is denied", async () => {
        const getAdId = vi.fn(async () => "expo-id");
        getDeviceInfo.mockReturnValue(fullDeviceInfo);
        getExpoTT.mockReturnValue({
            getTrackingPermissionsAsync: async () => ({ status: "denied" }),
            getAdvertisingId: getAdId,
        });

        const data = await collect(true);

        expect(data.advertising).toEqual({ authorized: false, id: null });
        expect(getAdId).not.toHaveBeenCalled();
    });

    it.each([
        ["arm64-v8a", "arm64"],
        ["x86_64", "x86_64"],
        ["x86", "x86"],
        ["armeabi-v7a", "arm"],
        ["mips", "mips"],
    ])("normalizes the %s abi to %s", async (abi, expected) => {
        getDeviceInfo.mockReturnValue({ ...fullDeviceInfo, supportedAbis: async () => [abi] });

        const data = await collect(false);

        expect(data.device?.architecture).toBe(expected);
    });

    it("reports unknown architecture when no abis are reported", async () => {
        getDeviceInfo.mockReturnValue({ ...fullDeviceInfo, supportedAbis: async () => [] });

        const data = await collect(false);

        expect(data.device?.architecture).toBe("unknown");
    });

    it("falls back to the async getUniqueId when the sync variant is missing", async () => {
        const { getUniqueIdSync, ...withoutSync } = fullDeviceInfo;
        void getUniqueIdSync;
        getDeviceInfo.mockReturnValue({ ...withoutSync, getUniqueId: async () => "async-id" });

        const data = await collect(false);

        expect(data.device?.id).toBe("async-id");
    });

    it("returns an empty object rather than throwing when collection fails", async () => {
        getDeviceInfo.mockImplementation(() => { throw new Error("boom"); });
        vi.spyOn(console, "error").mockImplementation(() => {});

        // A device-info failure must not take down trackEvent.
        await expect(md.getMobileData(configWith(false))).resolves.toEqual({});
    });
});
