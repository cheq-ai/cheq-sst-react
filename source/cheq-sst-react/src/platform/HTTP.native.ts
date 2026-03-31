import DeviceInfo from 'react-native-device-info'
import { Platform } from 'react-native'
import { getStorageItem, setStorageItem } from "../Storage";
import { UUID_KEY } from "../Info";
import type { SendHttpPostArgs, SendErrorArgs } from "../Types"
import { debug, debug_request, debug_response } from "../utils/logger";

async function getUserAgent(userAgent?: string | null): Promise<string | undefined> {
    if (userAgent) return userAgent;
    try {
        if (Platform.OS === 'android') return DeviceInfo.getUserAgent();
        if (Platform.OS === 'ios') return await DeviceInfo.getUserAgent();
    }
    catch {
        return undefined;
    }
}

export async function sendHttpPost({ userAgent, url, jsonString }: SendHttpPostArgs): Promise<number | null> {
    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const resolve_userAgent = await getUserAgent(userAgent);
        if (resolve_userAgent) headers["User-Agent"] = resolve_userAgent;

        const uuid = getStorageItem(UUID_KEY);
        if (uuid) headers["Cookie"] = `uuid=${uuid}`;

        debug_request(url, {
            method: "POST",
            headers,
            body: jsonString
        });

        const res = await fetch(url, { method: "POST", headers, body: jsonString });
        const newUuid = res.headers.get("x-offsite-uuid");
        if (newUuid) setStorageItem(UUID_KEY, newUuid);

        await debug_response(res);
        return res.status;
    }
    catch (error) {
        debug("Request failed", { url, error });
        throw error;
    }
}

export async function sendErrorBeacon({ userAgent, url, referrer }: SendErrorArgs): Promise<boolean> {
    const headers: Record<string, string> = { Referer: referrer };
    if (userAgent) headers["User-Agent"] = userAgent;

    try {
        debug("Error beacon", { url, headers });
        const res = await fetch(url, { method: "GET", headers });
        if (!res.ok) {
            debug("Error beacon returned non-OK status", { url, status: res.status });
            return false;
        }
        return true;
    }
    catch (error) {
        debug("Error beacon failed", { url, error });
        return false;
    }
}