import { Dimensions, Platform } from "react-native";
import * as TrackingTransparency from "expo-tracking-transparency";
import { LIBRARY_NAME, LIBRARY_VERSION } from "../Info";
import type { Config } from "../Types";
import { getScreenInfo } from "./virtualBrowser"

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

function getOrientation(width: number, height: number): "Portrait" | "Landscape" {
    return height >= width ? "Portrait" : "Landscape";
}

let cachedATT: boolean | null = null;
async function getAdvertisingAuthorization(): Promise<boolean> {
    try {
        if (Platform.OS !== "ios") return true;
        if (cachedATT !== null) return cachedATT;

        const { status } = await TrackingTransparency.requestTrackingPermissionsAsync();
        cachedATT = status === "granted";
        return cachedATT;
    }
    catch(err) {
        cachedATT = false;
        return false;
    }
}

async function getAdvertisingId(): Promise<string | null> {
    try {
        const id = await TrackingTransparency.getAdvertisingId();
        return id || null;
    }
    catch(err) {
        return null;
    }
}

export async function getMobileData(config: Config) {
    const advertising_enabled = config.models.hasAdvertising();
    const advertising_authorized = advertising_enabled ? await getAdvertisingAuthorization() : null;
    const advertising_id = advertising_authorized ? await getAdvertisingId() : null;

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