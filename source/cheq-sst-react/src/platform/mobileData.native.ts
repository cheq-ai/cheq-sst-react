import { NativeModules, Platform } from "react-native";
import { LIBRARY_NAME, LIBRARY_VERSION } from "../Info";
import type { Config, ATTStatus } from "../Types";
import { getScreenInfo } from "./virtualBrowser"
import { debug } from "../utils/logger"

const OS_NAME_MAP: Record<string, string> = {
    android: "Android",
    ios: "iOS"
};

function getDeviceInfo() {
    try { return require("react-native-device-info") as typeof import("react-native-device-info"); }
    catch { return null; }
}

function getOSName(): string {
    return OS_NAME_MAP[Platform.OS] || Platform.OS;
}

function getExpoTrackingTransparency() {
    try { return require("expo-tracking-transparency") as typeof import("expo-tracking-transparency"); }
    catch { return null; }
}

function getNativeAdvertisingModule() {
    try { return NativeModules?.AdvertisingId; }
    catch { return null; }
}

function getRNTrackingTransparency() {
    try { return require("react-native-tracking-transparency") as Record<string, unknown>; }
    catch { return null; }
}

function normalizeATTStatus(status: unknown): ATTStatus {
    if (status === "authorized" || status === "denied" || status === "restricted" || status === "notDetermined") {
        return status;
    }

    // Some libs return: "granted" | "denied" | "unavailable" | "not-determined"/etc.
    if (status === "granted") return "authorized";
    if (status === "not-determined" || status === "undetermined") return "notDetermined";
    if (status === "unavailable") return "unavailable";

    return "unavailable";
}

function normalizeAbi(abi: string | undefined | null): string {
    if (!abi) return "unknown";

    const a = abi.toLowerCase();
    if (a.includes("arm64")) return "arm64";
    if (a.includes("x86_64")) return "x86_64";
    if (a.includes("x86")) return "x86";
    if (a.includes("armeabi")) return "arm";
    return a;
}

async function getDeviceId(deviceInfo: any) {
    let device_id_raw: unknown;
    if (typeof deviceInfo?.getUniqueIdSync === "function") {
        device_id_raw = deviceInfo.getUniqueIdSync();
    }
    else if (typeof deviceInfo?.getUniqueId === "function") {
        device_id_raw = await deviceInfo.getUniqueId();
    }
    else {
        device_id_raw = null;
    }

    const device_id = typeof device_id_raw === "string" ? device_id_raw : "unknown";
    return device_id;
}

export async function getTrackingAuthorizationStatus(): Promise<ATTStatus> {
    if (Platform.OS !== "ios") return "authorized";

    // Expo read
    const expoTT = getExpoTrackingTransparency();
    if (expoTT?.getTrackingPermissionsAsync) {
        const res = await expoTT.getTrackingPermissionsAsync();
        return normalizeATTStatus(res.status);
    }

    // RN lib read (try common names)
    const rnTT = getRNTrackingTransparency();
    const getStatus = (rnTT?.getTrackingStatus as unknown) ?? (rnTT?.getTrackingAuthorizationStatus as unknown) ?? (rnTT?.getTrackingPermissionStatus as unknown);

    if (typeof getStatus === "function") {
        const status = await (getStatus as () => Promise<unknown>)();
        return normalizeATTStatus(status);
    }

    return "unavailable";
}

let cachedATT: boolean | null = null;
export async function getAdvertisingAuthorization(): Promise<boolean> {
    if (Platform.OS !== "ios") return true;
    if (cachedATT !== null) return cachedATT;

    // Expo prompt
    const expoTT = getExpoTrackingTransparency();
    if (expoTT?.requestTrackingPermissionsAsync) {
        const res = await expoTT.requestTrackingPermissionsAsync();
        cachedATT = normalizeATTStatus(res.status) === "authorized";
        return cachedATT;
    }

    // RN lib prompt (try common names)
    const rnTT = getRNTrackingTransparency();
    const request =
        (rnTT?.requestTrackingPermission as unknown) ??
        (rnTT?.requestTrackingAuthorization as unknown) ??
        (rnTT?.requestTrackingPermissions as unknown);

    if (typeof request === "function") {
        const status = await (request as () => Promise<unknown>)();
        cachedATT = normalizeATTStatus(status) === "authorized";
        return cachedATT;
    }

    // Fallback to current status if we can't prompt
    const status = await getTrackingAuthorizationStatus();
    cachedATT = status === "authorized";
    return cachedATT;
}

export async function getAdvertisingId(): Promise<string | null> {
    // React native
    try {
        if (Platform.OS === "android" || Platform.OS === "ios") {
            const nativeAd = getNativeAdvertisingModule();
            if (nativeAd?.getAdvertisingId) {
                const response = await nativeAd.getAdvertisingId();
                return response?.advertisingId ?? null;
            }
        }
    }
    catch {}

    // Expo
    try {
        const expoTT = getExpoTrackingTransparency();
        if (expoTT?.getAdvertisingId) {
            const id = await expoTT.getAdvertisingId();
            return id || null;
        }
    } catch {}

    return null;
}

export async function getMobileData(config: Config) {
    try {
        const advertising_enabled = config.models.hasAdvertising();
        const att_status = advertising_enabled ? await getTrackingAuthorizationStatus() : null;
        const advertising_authorized = att_status === "authorized";

        debug(`att_status: ${att_status}`);
        debug(`advertising_authorized: ${advertising_authorized}`);

        const advertising_id = advertising_authorized ? await getAdvertisingId() : null;
        debug(`advertising_id: ${advertising_id}`);

        const deviceInfo = getDeviceInfo();

        const app_name = deviceInfo?.getApplicationName?.() ?? "";
        const app_version = deviceInfo?.getVersion?.() ?? "";
        const app_build = deviceInfo?.getBuildNumber?.() ?? "";
        const app_namespace = deviceInfo?.getBundleId?.() ?? "";

        const device_manufacturer = await deviceInfo?.getManufacturer?.() ?? "";
        const device_supported_abis = typeof deviceInfo?.supportedAbis === "function"? await deviceInfo.supportedAbis() : [];
        const device_architecture = device_supported_abis.length > 0 ? normalizeAbi(device_supported_abis[0]) : "unknown";

        const device_model = deviceInfo?.getModel();
        const device_id = await getDeviceId(deviceInfo);

        const screen_info = getScreenInfo();
        const device_os_name = getOSName();
        const device_os_version = String(Platform.Version ?? "unknown");

        return {
            ...(advertising_enabled ? {
                advertising: {
                    authorized: advertising_authorized, id: advertising_id
                }
            } : {}),
            app: {
                name: app_name || "unknown",
                version: app_version || "unknown",
                build: app_build || "unknown",
                namespace: app_namespace || "unknown"
            },
            device: {
                manufacturer: (device_manufacturer || "unknown").toLowerCase(),
                model: device_model || "unknown",
                architecture: device_architecture || "unknown",
                id: device_id || "unknown",
                screen: {
                    height: screen_info.height,
                    width: screen_info.width,
                    orientation: screen_info.orientation
                },
                os: {
                    name: device_os_name || "unknown",
                    version: device_os_version || "unknown"
                },
                library: {
                    name: LIBRARY_NAME,
                    version: LIBRARY_VERSION
                }
            }
        };
    }
    catch(err) {
        debug('getMobileData error', err);
        return {};
    }
}