import type { ScreenInfo } from "../Types";

export function getLanguage(): string {
    const nav: any = (globalThis as any)?.navigator;
    if (nav?.languages?.length) return nav.languages.join(",");
    return nav?.language ?? "";
}

export function getTimezone(): string {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; }
    catch { return ""; }
}

export function getScreenInfo(): ScreenInfo {
    let width: number | null = null;
    let height: number | null = null;
    let orientation: "portrait" | "landscape" | null = null;

    if (typeof window !== "undefined") {
        width = window.innerWidth || window.screen?.width || null;
        height = window.innerHeight || window.screen?.height || null;

        if (typeof window.matchMedia === "function") {
            const portrait = window.matchMedia("(orientation: portrait)");
            const landscape = window.matchMedia("(orientation: landscape)");

            if (portrait?.matches) orientation = "portrait";
            else if (landscape?.matches) orientation = "landscape";
        }
    }

    return { width, height, orientation };
}

export function getPageURL(): string {
    if (typeof window === "undefined") return "";
    return typeof window !== "undefined" ? window.location?.href : "";
}

export function getPageTitle(): string {
    return typeof document !== "undefined" ? document.title : "";
}

export function getReferrer(): string {
    return typeof document !== "undefined" ? document.referrer : "";
}

export function getScreenDepth(): number | null {
    const s: any = (globalThis as any)?.screen;
    const depth = typeof s?.colorDepth === "number" ? s.colorDepth : typeof s?.pixelDepth === "number" ? s.pixelDepth : null;
    return depth;
}