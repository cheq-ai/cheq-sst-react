// `typeof import(...)`, not hand-written shapes: the packages are devDependencies, so the
// compiler checks these against the real APIs. A hand-written shape asserts one instead --
// which is how a removed expo-localization export survived as dead code.
export type DeviceInfoModule = typeof import("react-native-device-info");
export type ExpoTrackingModule = typeof import("expo-tracking-transparency");
export type ExpoLocalizationModule = typeof import("expo-localization");
export type LocalizeModule = typeof import("react-native-localize");
export type RNTrackingModule = typeof import("react-native-tracking-transparency");

// v1/v2 (multiGet/multiRemove) are not installed here, so that half is hand-written.
export type AsyncStorageV3Module = typeof import("@react-native-async-storage/async-storage").default;
export type AsyncStorageLegacyModule = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys(): Promise<readonly string[]>;
    multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
    multiRemove(keys: readonly string[]): Promise<void>;
};
export type AsyncStorageModule = AsyncStorageV3Module | AsyncStorageLegacyModule;
