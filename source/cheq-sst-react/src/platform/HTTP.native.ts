import { Platform } from 'react-native'
import { getStorageItem, hydrateStorage, setStorageItem } from "../Storage";
import { UUID_KEY } from "../Info";
import type { SendHttpPostArgs, SendErrorArgs } from "../Types"
import { debug, debug_request, debug_response } from "../utils/logger";
import { reportSstErrorOnce } from "../utils/errorReporter";
import { getDeviceInfo } from "./optionalModules";

// Headers.get() joins repeated headers with ", ", and the value can arrive cookie-shaped
// ("uuid=<v>"). Anything but a bare UUID is dropped rather than stored.
function parseUuid(raw: string | null): string | null {
    if (!raw) return null;

    const first = raw.split(",")[0].trim();
    const value = (first.startsWith("uuid=") ? first.slice("uuid=".length) : first).trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        debug("Ignoring malformed uuid", { raw });
        return null;
    }
    return value;
}

async function getUserAgent(userAgent?: string | null): Promise<string | undefined> {
    if (userAgent) return userAgent;

    // An absent User-Agent reads as a bot signature at the collector, so a missing peer gets
    // the operator's real users misclassified. Beaconed once, since debug() is off in prod.
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
        reportSstErrorOnce("missingUserAgent", "react-native-device-info not installed; requests have no User-Agent",
            "HTTP.getUserAgent", "missingUserAgent");
        return undefined;
    }

    try {
        // Must be awaited: `return <promise>` inside try skips the catch below, and the
        // rejection would abort the whole event send.
        if (Platform.OS === 'android' || Platform.OS === 'ios') return await deviceInfo.getUserAgent();
        debug("No User-Agent source for platform", { platform: Platform.OS });
    }
    catch (error) {
        debug("getUserAgent failed", { error });
        const message = error instanceof Error ? error.message : String(error);
        reportSstErrorOnce("userAgentThrew", `react-native-device-info getUserAgent threw; requests have no User-Agent: ${message}`,
            "HTTP.getUserAgent", "missingUserAgent");
    }
    return undefined;
}

export async function sendHttpPost({ userAgent, url, jsonString }: SendHttpPostArgs): Promise<number | null> {
    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const resolve_userAgent = await getUserAgent(userAgent);
        if (resolve_userAgent) headers["User-Agent"] = resolve_userAgent;

        // The SDK owns the uuid, matching the Swift and Kotlin SDKs. Only safe alongside
        // `credentials: "omit"` below -- with the jar active, iOS appends our header to its
        // own copy (addValue, not setValue) and the request carries `uuid=X,uuid=X`. RN 0.86.
        // Or a cold start sends no uuid and the collector mints a new identity.
        await hydrateStorage();
        const uuid = parseUuid(getStorageItem(UUID_KEY));
        if (uuid) headers["Cookie"] = `uuid=${uuid}`;

        debug_request(url, {
            method: "POST",
            headers,
            body: jsonString
        });

        // Keeps the platform cookie jar out, so the header above is the only carrier -- the
        // RN analogue of Swift's ephemeral URLSession. Note RN's redirect handler re-attaches
        // jar cookies regardless, so this holds only while the collector does not redirect.
        const res = await fetch(url, { method: "POST", headers, body: jsonString, credentials: "omit" });
        const uuid_header_response = res.headers.get("x-offsite-uuid");
        const newUuid = parseUuid(uuid_header_response);
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