import * as RNLocalize from "react-native-localize";
import { Dimensions } from "react-native";
import type { ScreenInfo } from "../Types";

export function getScreenInfo(): ScreenInfo {
    const { width, height } = Dimensions.get("window");
    const orientation = (width && height) ? (width <= height ? "portrait" : "landscape") : null;
    return { width, height, orientation };
}
export function getLanguage(): string {
    const locales = RNLocalize.getLocales();
    return locales.length ? locales[0].languageTag : "";
}
export function getTimezone(): string {
    return RNLocalize.getTimeZone();
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