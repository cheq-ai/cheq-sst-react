import { NativeModules, Platform } from "react-native";
import { LIBRARY_NAME, LIBRARY_VERSION } from "../Info";
import type { Config } from "../Types";
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

let cachedATT: boolean | null = null;
async function getAdvertisingAuthorization(): Promise<boolean> {
    try {
        debug(`getAdvertisingAuthorization: platform: ${Platform.OS}`);
        if (Platform.OS !== "ios") return true;
        if (cachedATT !== null) return cachedATT;

        // Expo check
        const expoTT = getExpoTrackingTransparency();
        if (expoTT?.requestTrackingPermissionsAsync) {
            const { status } = await expoTT.requestTrackingPermissionsAsync();
            cachedATT = status === "granted";
            return cachedATT;
        }

        // Non-expo fallback
        const nativeAd = getNativeAdvertisingModule();
        if (nativeAd?.getAdvertisingId) {
            cachedATT = true;
            return true;
        }

        cachedATT = false;
        return false;
    }
    catch {
        cachedATT = false;
        return false;
    }
}

async function getAdvertisingId(): Promise<string | null> {
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
        const advertising_authorized = advertising_enabled ? await getAdvertisingAuthorization() : null;
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
        const device_architecture = device_supported_abis.length > 0 ? device_supported_abis[0] : "unknown";
        const device_model = deviceInfo?.getModel();

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
                screen: {
                    width: screen_info.width,
                    height: screen_info.height,
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