import { Dimensions } from "react-native";
import { ScreenInfo } from "../Types";
import { debug } from "../utils/logger"
import { getExpoLocalization, getLocalize } from "./optionalModules";

export function getScreenInfo(): ScreenInfo {
    const { width, height } = Dimensions.get("window");

    const w = Math.floor(width);
    const h = Math.floor(height);
    const orientation = (w && h) ? (w <= h ? "portrait" : "landscape") : "unknown";
    return { width: w, height: h, orientation };
}
export function getLanguage(): string {
    // Each source is tried only if it is actually installed, so a throw from one does not
    // get misread as "not installed" and silently fall through to the other.
    const localize = getLocalize();
    if (localize) {
        try {
            const tag = localize.getLocales()?.[0]?.languageTag;
            if (tag) return tag;
            debug("react-native-localize returned no languageTag");
        }
        catch (error) { debug("react-native-localize getLocales failed", { error }); }
    }

    const expoLocalize = getExpoLocalization();
    if (expoLocalize) {
        try {
            const tag = expoLocalize.getLocales()?.[0]?.languageTag;
            if (tag) return tag;
            debug("expo-localization returned no languageTag");
        }
        catch (error) { debug("expo-localization getLocales failed", { error }); }
    }

    debug("Unable to get language from react-native-localize or expo-localization");
    return "";
}
export function getTimezone(): string {
    const localize = getLocalize();
    if (localize) {
        try {
            const timezone = localize.getTimeZone();
            if (timezone) return timezone;
            debug("react-native-localize returned no timezone");
        }
        catch (error) { debug("react-native-localize getTimeZone failed", { error }); }
    }

    const expoLocalize = getExpoLocalization();
    if (expoLocalize?.getCalendars) {
        try {
            const timeZone = expoLocalize.getCalendars()?.[0]?.timeZone;
            if (timeZone) return timeZone;
            debug("expo-localization returned no timeZone");
        }
        catch (error) { debug("expo-localization getCalendars failed", { error }); }
    }

    debug("Unable to get timezone from react-native-localize or expo-localization");
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