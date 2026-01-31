import { Dimensions } from "react-native";
import { RNLocalize, ScreenInfo } from "../Types";

function getRNLocalize(): RNLocalize | null {
    try { return require("react-native-localize") as RNLocalize; }
    catch { return null; }
}

export function getScreenInfo(): ScreenInfo {
    const { width, height } = Dimensions.get("window");

    const w = Math.floor(width);
    const h = Math.floor(height);
    const orientation = (w && h) ? (w <= h ? "portrait" : "landscape") : "unknown";
    return { width: w, height: h, orientation };
}
export function getLanguage(): string {
    const rnLocalize = getRNLocalize();
    if (rnLocalize) {
        const locales = rnLocalize.getLocales();
        return locales.length ? locales[0].languageTag : "";
    }
    return "";
}
export function getTimezone(): string {
    const rnLocalize = getRNLocalize();
    if (rnLocalize) return rnLocalize.getTimeZone();
    return "";
}
export function getPageURL(): string {
    return "";
}
export function getPageTitle(): string {
    return "";
}
export function getReferrer(): string {
    return "";
}
export function getScreenDepth(): number | null {
    return null;
}