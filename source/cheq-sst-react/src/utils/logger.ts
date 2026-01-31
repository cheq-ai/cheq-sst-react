let DEBUG = false;

function isNodeRuntime(): boolean {
    return (typeof process !== "undefined") && !!process.stdout && !!process.versions?.node;
}

export function setDebug(enabled: boolean) {
    DEBUG = enabled;
}

export function debug(...args: unknown[]) {
    if (!DEBUG) return;

    // Node / Expo native / Metro
    if (isNodeRuntime()) {
        process.stdout.write(
            `[SST] ${args.map(a => {
                try { return typeof a === "string" ? a : JSON.stringify(a); }
                catch { return String(a); }
            }).join(" ")}\n`
        );
        return;
    }

    // Browser
    if (typeof console !== "undefined") {
        console.debug("[SST]", ...args);
    }
}