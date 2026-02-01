import type { Config } from "../Types";

export async function getMobileData(_config: Config): Promise<Record<string, never>> {
    return {};
}

export async function getAdvertisingAuthorization(): Promise<boolean> {
    return true;
}

export async function getAdvertisingId(): Promise<null> {
    return null;
}

export async function getTrackingAuthorizationStatus(): Promise<string> {
    return "authorized";
};