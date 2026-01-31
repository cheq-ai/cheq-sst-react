import { getStorageItem, setStorageItem } from "../Storage";
import { UUID_KEY } from "../Info";
import type { SendHttpPostArgs, SendErrorArgs } from "../Types"
import { debug } from "../utils/logger";

export async function sendHttpPost({ userAgent, url, jsonString }: SendHttpPostArgs): Promise<number | null> {
    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (userAgent) headers["User-Agent"] = userAgent;

        const uuid = getStorageItem(UUID_KEY);
        if (uuid) headers["Cookie"] = `uuid=${uuid}`;

        debug("[SST] HTTP POST request", { url, headers, body: jsonString });

        const res = await fetch(url, { method: "POST", headers, body: jsonString });
        const newUuid = res.headers.get("x-offsite-uuid");
        if (newUuid) setStorageItem(UUID_KEY, newUuid);
        debug("[SST] HTTP POST response", { status: res.status });
        return res.status;
    }
    catch (error) {
        debug("[SST] HTTP POST failed", { url, error });
        return null;
    }
}

export async function sendErrorBeacon({ userAgent, url, referrer }: SendErrorArgs): Promise<boolean> {
    const headers: Record<string, string> = { Referer: referrer };
    if (userAgent) headers["User-Agent"] = userAgent;

    try {
        debug("[SST] Error beacon request", { url, headers });
        await fetch(url, { method: "GET", headers });
        return true;
    }
    catch (error) {
        debug("[SST] Error beacon failed", { url, error });
        return false;
    }
}