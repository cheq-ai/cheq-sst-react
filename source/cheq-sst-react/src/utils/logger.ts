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