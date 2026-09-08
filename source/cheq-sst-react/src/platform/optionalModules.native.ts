import { debug } from "../utils/logger";
import type {
    AsyncStorageModule,
    DeviceInfoModule,
    ExpoLocalizationModule,
    ExpoTrackingModule,
    LocalizeModule,
    RNTrackingModule,
} from "./optionalModules.types";

// Resolution of the optional peers, kept separate from invocation: a caller wrapping both in
// one try/catch cannot tell "not installed" from "the call threw", and would fall through to
// a backup package that was never the problem.
function optional<T>(name: string, load: () => T): T | null {
    try { return load(); }
    catch {
        debug("Optional module not installed", { name });
        return null;
    }
}

export type {
    AsyncStorageModule,
    DeviceInfoModule,
    ExpoLocalizationModule,
    ExpoTrackingModule,
    LocalizeModule,
    RNTrackingModule,
} from "./optionalModules.types";

export function getDeviceInfo(): DeviceInfoModule | null {
    return optional("react-native-device-info", () => require("react-native-device-info") as DeviceInfoModule);
}

export function getExpoTrackingTransparency(): ExpoTrackingModule | null {
    return optional("expo-tracking-transparency", () => require("expo-tracking-transparency") as ExpoTrackingModule);
}

export function getRNTrackingTransparency(): RNTrackingModule | null {
    return optional("react-native-tracking-transparency", () => require("react-native-tracking-transparency") as RNTrackingModule);
}

export function getLocalize(): LocalizeModule | null {
    return optional("react-native-localize", () => require("react-native-localize") as LocalizeModule);
}

export function getExpoLocalization(): ExpoLocalizationModule | null {
    return optional("expo-localization", () => require("expo-localization") as ExpoLocalizationModule);
}

export function getAsyncStorage(): AsyncStorageModule | null {
    return optional("@react-native-async-storage/async-storage", () => {
        const mod = require("@react-native-async-storage/async-storage") as { default?: AsyncStorageModule } & AsyncStorageModule;
        return (mod?.default ?? mod) as AsyncStorageModule;
    });
}
