import type {
    AsyncStorageModule,
    DeviceInfoModule,
    ExpoLocalizationModule,
    ExpoTrackingModule,
    LocalizeModule,
} from "./optionalModules.native";

// None of these packages exist on web, so every accessor is null and callers take their
// existing "module absent" path. Mirrors optionalModules.native.ts for the .ts/.native.ts pair.
export type { DeviceInfoModule, ExpoLocalizationModule, ExpoTrackingModule, LocalizeModule };

export function getDeviceInfo(): DeviceInfoModule | null { return null; }
export function getExpoTrackingTransparency(): ExpoTrackingModule | null { return null; }
export function getRNTrackingTransparency(): Record<string, unknown> | null { return null; }
export function getLocalize(): LocalizeModule | null { return null; }
export function getExpoLocalization(): ExpoLocalizationModule | null { return null; }
export function getAsyncStorage(): AsyncStorageModule | null { return null; }
