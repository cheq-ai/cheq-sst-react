const UUID_KEY = "cheq.sst.http:uuid";
const window_exists = typeof window !== "undefined";

export function getStorageItem(key: string): string | null {
    return window_exists ? localStorage.getItem(key) : null;
}

export function setStorageItem(key: string, value: string): void {
    if (window_exists) {
        localStorage.setItem(key, value);
    }
}

export function removeStorageItem(key: string): void {
    if (window_exists) {
        localStorage.removeItem(key);
    }
}

export const HTTP = {
    getUUID(): string | null {
        return getStorageItem(UUID_KEY);
    },

    clearUUID(): void {
        removeStorageItem(UUID_KEY);
    },

    async sendHttpPost(args: {
        userAgent?: string | null;
        url: string;
        jsonString: string;
        debug: boolean;
    }): Promise<number | null> {
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (args.userAgent) headers["User-Agent"] = args.userAgent;

            const uuid = getStorageItem(UUID_KEY);
            if (uuid) headers["Cookie"] = `uuid=${uuid}`;

            if (args.debug) console.debug("--- REQUEST ---", { url: args.url, headers, body: args.jsonString });

            const res = await fetch(args.url, { method: "POST", headers, body: args.jsonString });
            const newUuid = res.headers.get("x-offsite-uuid");
            if (newUuid) setStorageItem(UUID_KEY, newUuid);
            if (args.debug) console.debug("--- RESPONSE ---", { status: res.status });

            return res.status;
        }
        catch {
            return null;
        }
    },

    async sendError(args: {
        userAgent?: string | null;
        url: string;
        referrer: string;
    }): Promise<boolean> {
        const headers: Record<string, string> = { Referer: args.referrer };
        if (args.userAgent) headers["User-Agent"] = args.userAgent;

        try {
            await fetch(args.url, { method: "GET", headers });
            return true;
        } catch {
            return false;
        }
    },
};