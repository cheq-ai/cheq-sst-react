import type { SendHttpPostArgs, SendErrorArgs } from "../Types"
import { debug, debug_request, debug_response } from "../utils/logger";

function safeParseJson(jsonString: string): unknown {
    try { return JSON.parse(jsonString); }
    catch { return null; }
}

function makeTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
    // AbortSignal.timeout exists in modern browsers; guard for compatibility.
    const anyAbortSignal = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
    return anyAbortSignal.timeout ? anyAbortSignal.timeout(timeoutMs) : undefined;
}

async function sendFetchPost(args: SendHttpPostArgs): Promise<void> {
    const { url, jsonString, timeoutMs = 20_000, onFailedRequest } = args;
    const parsedBody = safeParseJson(jsonString);

    const fetchOptions: RequestInit = {
        method: "POST",
        body: jsonString,
        headers: {
            "Content-Type": "application/json"
        },
        // Helps during page unload/backgrounding (not guaranteed everywhere, but useful).
        keepalive: true
    };

    const signal = makeTimeoutSignal(timeoutMs);
    if (signal) fetchOptions.signal = signal;

    try {
        debug_request(url, {
            method: fetchOptions.method,
            headers: fetchOptions.headers,
            body: jsonString
        });

        const res = await fetch(url, fetchOptions);
        debug_response(res);

        if (!res.ok) onFailedRequest?.({ name: "SST request error response", body: parsedBody });
    }
    catch (error) {
        const name = (error as { name?: string } | null)?.name === "TimeoutError" ? "SST request timeout" : "SST request failed";
        debug("Fetch request failed", { url, error });
        onFailedRequest?.({ name, body: parsedBody, error });
    }
}

function sendBeaconJson(url: string, jsonString: string): boolean {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
        return false;
    }

    debug_request(url, {
        method: "POST",
        body: jsonString
    });
    return navigator.sendBeacon(url, jsonString);
}

export async function sendHttpPost(args: SendHttpPostArgs): Promise<number | null> {
    const { url, jsonString } = args;
    const beaconOk = sendBeaconJson(url, jsonString);
    if (beaconOk) {
        debug("sendBeacon queued");
        // sendBeacon doesn't give status codes; we treat “queued” as success.
        return 204;
    }

    await sendFetchPost(args);
    return 200;
}

export function sendErrorBeacon({ url }: SendErrorArgs): boolean {
    try {
        debug_request(url, { method: "GET" });
        new Image().src = url;
        return true;
    }
    catch (error) {
        debug("sendErrorBeacon(web) failed", { url, error });
        return false;
    }
}