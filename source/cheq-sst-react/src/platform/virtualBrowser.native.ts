import { Dimensions } from "react-native";
import { ScreenInfo } from "../Types";
import { debug } from "../utils/logger"

export function getScreenInfo(): ScreenInfo {
    const { width, height } = Dimensions.get("window");

    const w = Math.floor(width);
    const h = Math.floor(height);
    const orientation = (w && h) ? (w <= h ? "portrait" : "landscape") : "unknown";
    return { width: w, height: h, orientation };
}
export function getLanguage(): string {
    try {
        const RNLocalize = require("react-native-localize");
        const locales = RNLocalize.getLocales();
        return locales.length ? locales[0].languageTag : "";
    }
    catch(err) {
        try {
            const expoLocalize = require("expo-localization");
            const locales = expoLocalize.getLocales();
            return locales.length ? locales[0].languageTag : "";
        }
        catch(err) {
            debug('Unable to get language from RNLocalize or Expo Localization');
        }
    }
    return "";
}
export function getTimezone(): string {
    try {
        const RNLocalize = require("react-native-localize");
        const timezone = RNLocalize.getTimeZone();
        return timezone;
    }
    catch(err) {
        try {
            const expoLocalize = require("expo-localization");
            const timezone = expoLocalize.timezone;
            return timezone;
        }
        catch(err) {
            debug('Unable to get timezone from RNLocalize or Expo Localization');
        }
    }
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