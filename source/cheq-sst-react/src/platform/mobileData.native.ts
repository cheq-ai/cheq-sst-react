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

function getRNAdvertisingId() {
    try { return require("react-native-advertising-id") as any; }
    catch { return null; }
}

function getExpoTrackingTransparency() {
    try { return require("expo-tracking-transparency") as typeof import("expo-tracking-transparency"); }
    catch { return null; }
}

let cachedATT: boolean | null = null;
async function getAdvertisingAuthorization(): Promise<boolean> {
    try {
        debug(`getAdvertisingAuthorization: platform: ${Platform.OS}`);
        if (Platform.OS !== "ios") return true;
        if (cachedATT !== null) return cachedATT;

        // React native check
        const rnAtt = getRNAdvertisingId(); // some libs include ATT helpers; if not, treat as not authorized
        if (rnAtt?.requestTrackingPermission) {
            const status = await rnAtt.requestTrackingPermission();
            cachedATT = status === "authorized" || status === "granted";
            return cachedATT;
        }

        // Expo check
        const expoTT = getExpoTrackingTransparency();
        if (expoTT?.requestTrackingPermissionsAsync) {
            const { status } = await expoTT.requestTrackingPermissionsAsync();
            cachedATT = status === "granted";
            return cachedATT;
        }

        cachedATT = false;
        return false;
    }
    catch {
        cachedATT = false;
        return false;
    }
}

export async function getAndroidAdId() {
    const response = await NativeModules.AdvertisingId.getAdvertisingId();
    return response?.advertisingId;
}

async function getAdvertisingId(): Promise<string | null> {
    // React native
    try {
        if (Platform.OS === "android") return await getAndroidAdId();

        const rnAdIdMod = getRNAdvertisingId();
        const getter = rnAdIdMod?.default?.getAdvertisingId ?? rnAdIdMod?.getAdvertisingId;
        if (typeof getter === "function") {
            const res = await getter();
            if (typeof res === "string") return res || null;
            return res?.advertisingId || null;
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