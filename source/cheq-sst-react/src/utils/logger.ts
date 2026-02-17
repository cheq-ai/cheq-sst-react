let DEBUG = false;

function isNodeRuntime(): boolean {
    return (typeof process !== "undefined") && !!process.stdout && !!process.versions?.node;
}

function safeStringify(value: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
        if (typeof val === "object" && val !== null) {
            if (seen.has(val)) return "[Circular]";
            seen.add(val);
        }
        if (typeof val === "function") return `[Function ${val.name || "anonymous"}]`;
        if (typeof val === "undefined") return "[Undefined]";
        return val;
    }, 2);
}

export function setDebug(enabled: boolean) {
    DEBUG = enabled;
    debug("debug enabled");
}

export function debug(message: string, ...args: unknown[]) {
    if (!DEBUG) return;

    if (typeof message !== "string") {
        throw new Error("[SST] debug() first argument must be a string");
    }

    const serializedArgs = args.map(arg => {
        if (typeof arg === "string") return arg;

        try {
            return JSON.stringify(arg);
        }
        catch (e) {
            return "[Unserializable]";
        }
    });

    const output = serializedArgs.length > 0 ? `${message} ${serializedArgs.join(" ")}` : message;

    // Prefer console (shows in RN/Expo and usually Metro too)
    if (typeof console !== "undefined") {
        console.log("[CHEQ SST]", output);
    }

    // Also write to stdout when available (nice for pure Node usage)
    if (isNodeRuntime()) {
        try { process.stdout.write(`[SST] ${output}\n`); }
        catch {}
    }
}

export function debug_request(url: string, options: RequestInit = {}): void {
    debug("--- REQUEST ---");
    debug(`\tURL: ${url}`);
    debug(`\tMethod: ${options.method ?? ""}`);

    if (options.headers) {
        debug("Request Headers:");
        const headers = options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers;

        Object.entries(headers).forEach(([key, value]) => {
            debug(`\t${key}: ${String(value)}`);
        });
    }

    if (options.body) {
        debug("Request Body:");
        try {
            debug(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
        }
        catch {
            debug("\t<unserializable body>");
        }
    }
};

export async function debug_response(response: Response): Promise<void> {
    debug("--- RESPONSE ---");
    debug(`\tStatus Code: ${response.status}`);

    // Headers
    debug("Response Headers:");
    Object.entries(Object.fromEntries(response.headers.entries())).forEach(([key, value]) => {
        debug(`\t${key}: ${value}`);
    });

    // Body (only if not 204)
    if (response.status !== 204) {
        debug("Response Body:");

        try {
            const cloned = response.clone();
            const text = await cloned.text();
            debug(text || "<empty body>");
        }
        catch {
            debug("\t<unreadable body>");
        }
    }
}