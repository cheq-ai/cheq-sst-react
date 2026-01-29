import { Dimensions, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import * as TrackingTransparency from "expo-tracking-transparency";
import { LIBRARY_NAME, LIBRARY_VERSION } from "../Info";
import type { Config } from "../Types";

const OS_NAME_MAP: Record<string, string> = {
    android: "Android",
    ios: "iOS"
};

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

    const app_name = DeviceInfo.getApplicationName();
    const app_version = DeviceInfo.getVersion();
    const app_build = DeviceInfo.getBuildNumber();
    const app_namespace = DeviceInfo.getBundleId();

    const device_manufacturer = await DeviceInfo.getManufacturer();
    const device_supported_abis = DeviceInfo.supportedAbis ? await DeviceInfo.supportedAbis() : [];
    const device_architecture = device_supported_abis.length ? device_supported_abis[0] : "unknown";
    const device_model = DeviceInfo.getModel();

    const { width, height } = Dimensions.get("window");
    const device_screen_width = width ? Math.round(width) : 0;
    const device_screen_height = height ? Math.round(height) : 0;
    const device_screen_orientation = getOrientation(device_screen_width, device_screen_height);

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
                width: device_screen_width,
                height: device_screen_height,
                orientation: device_screen_orientation
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