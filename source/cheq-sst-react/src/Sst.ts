import { CachedEnv, Config, SstError, TrackEventResult } from "./Types";
import { Event } from "./Models";
import { DataLayer } from "./DataLayer";
import { Cookies, LocalStorage, SessionStorage, clearUUID, getUUID } from "./Storage";
import { sendHttpPost, sendErrorBeacon } from "./platform/HTTP";
import { getPlatform } from "./platform/env";
import { getLanguage, getPageTitle, getPageURL, getReferrer, getScreenInfo, getScreenDepth, getTimezone } from "./platform/virtualBrowser";
import { getMobileData } from "./platform/mobileData"
import { debug, setDebug } from "./utils/logger";

const SST_VERSION = "1.0.0";
const SST_ORIGIN = "mobile";
let cachedEnv: CachedEnv | null = null;

if (typeof window !== "undefined") {
    // update cache on screen resize
    window.addEventListener("resize", () => {
        cachedEnv = null;
    }, { passive: true });
}

const baseParams: Record<string, string> = {
    sstVersion: SST_VERSION,
    sstOrigin: SST_ORIGIN,
    sstPlatform: getPlatform()
};

function getCachedEnv(screenEnabled: boolean): CachedEnv {
    if (cachedEnv) return cachedEnv;

    cachedEnv = {
        language: getLanguage(),
        timezone: getTimezone(),
        screen: screenEnabled ? getScreenInfo() : { width: null, height: null },
        screenDepth: getScreenDepth()
    };

    return cachedEnv;
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}

function buildQuery(base: Record<string, string>, extra: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) {
        sp.append(k, v);
    }
    for (const [k, v] of Object.entries(extra)) {
        sp.append(k, v);
    }
    return sp.toString();
}

function buildSstUrl(domain: string, clientName: string, params: Record<string, string>) {
    const qs = buildQuery(baseParams, params);
    return `https://${domain}/pc/${clientName}/sst?${qs}`;
}

function buildErrorUrl(nexusHost: string, q: Record<string, string>) {
    return `https://${nexusHost}/error/e.gif?${new URLSearchParams(q).toString()}`;
}

export const Sst = (() => {
    let config: Config | null = null;
    let userAgent: string | null = null;

    const dataLayer = new DataLayer();
    const cookies = new Cookies();
    const localStorageStore = new LocalStorage();
    const sessionStorageStore = new SessionStorage();

    function getUA() {
        return config?.virtualBrowser.userAgent ?? userAgent ?? null;
    }

    async function ensureUserAgent() {
        if (!config) return;
        if (!config.virtualBrowser.userAgent && !userAgent) {
            userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
        }
    }

    function storagePayload() {
        const out: Record<string, any> = {};
        const c = cookies.eventData();
        const l = localStorageStore.eventData();
        const s = sessionStorageStore.eventData();
        if (c) out.cookies = c;
        if (l) out.localStorage = l;
        if (s) out.sessionStorage = s;
        return Object.keys(out).length ? out : null;
    }

    async function sendError(msg: string, fn: string, errorName: string) {
        if (!config) return false;

        const url = buildErrorUrl(config.nexusHost, {
            msg: truncate(msg, 1024),
            fn: truncate(fn, 256),
            client: truncate(config.clientName, 256),
            publishPath: truncate(config.publishPath, 256),
            errorName: truncate(errorName, 256),
        });

        const referrer = buildSstUrl(config.domain, config.clientName, {});
        return sendErrorBeacon({ userAgent: getUA(), url, referrer });
    }

    return {
        dataLayer,
        cookies,
        localStorage: localStorageStore,
        sessionStorage: sessionStorageStore,

        configure(next: Config) {
            setDebug(Boolean(next.debug));
            try {
                new URL(`https://${next.domain}/pc/${next.clientName}/sst`);
            }
            catch {
                if (next.debug) console.error("CHEQ SST not configured, invalid domain or client");
                return;
            }
            config = next;
            debug("CHEQ SST configured");
        },

        getCheqUuid() {
            return getUUID();
        },

        clearCheqUuid() {
            clearUUID();
        },

        async trackEvent(event: Event): Promise<TrackEventResult | null> {
            if (!config) return null;

            await ensureUserAgent();

            const eData: Record<string, any> = { ...event.data };
            if (eData.__timestamp == null) eData.__timestamp = config.dateProvider.now().getTime();

            const env = getCachedEnv(config.screenEnabled);
            const screen = env.screen;
            const language = env.language;
            const timezone = env.timezone;
            const screen_depth = env.screenDepth;

            const page_url = getPageURL();
            const page_title = getPageTitle();
            const referrer = getReferrer();

            const virtualBrowser: Record<string, any> = { height: screen.height, width: screen.width };
            if (screen_depth) virtualBrowser.screenDepth = screen_depth;
            if (page_url) virtualBrowser.page = page_url;
            if (page_title) virtualBrowser.title = page_title;
            if (referrer) virtualBrowser.referrer = referrer;
            if (language) virtualBrowser.language = language;
            if (timezone) virtualBrowser.timezone = timezone;
            if (config.virtualBrowser.page) virtualBrowser.page = config.virtualBrowser.page;

            const __mobileData = await getMobileData(config);
            const dataLayer_key = config.dataLayerName;
            const dataLayer_value = await dataLayer.all();
            let is_empty_dataLayer = false;
            if (!dataLayer_value) {
                is_empty_dataLayer = true;
            }
            else if (Array.isArray(dataLayer_value) && (dataLayer_value.length === 0)) {
                is_empty_dataLayer = true;
            }
            else if ((typeof dataLayer_value === 'object') && (Object.keys(dataLayer_value).length === 0)) {
                is_empty_dataLayer = true;
            }

            const sstData: Record<string, any> = {};
            
            // settings
            sstData.settings = { publishPath: config.publishPath, nexusHost: config.nexusHost };

            // dataLayer
            sstData.dataLayer = {};
            if (__mobileData && (Object.keys(__mobileData).length > 0)) sstData.dataLayer.__mobileData = __mobileData;
            if (dataLayer_key && !is_empty_dataLayer) sstData.dataLayer[dataLayer_key] = dataLayer_value;

            // events
            sstData.events = [{ name: event.name, data: eData }];

            // virtualBrowser
            sstData.virtualBrowser = virtualBrowser;

            // storage
            const storage = storagePayload();
            if (storage) sstData.storage = storage;

            // cleanup
            if (Object.keys(sstData.dataLayer).length === 0) delete sstData.dataLayer;

            let jsonString: string;
            try {
                jsonString = JSON.stringify(sstData);
            } catch (e: any) {
                await sendError(String(e?.message ?? e), "Sst.trackEvent", "SerializationError");
                return null;
            }

            const url = buildSstUrl(config.domain, config.clientName, event.parameters);

            try {
                const statusCode = await sendHttpPost({
                    userAgent: getUA(),
                    url,
                    jsonString,
                    debug: config.debug,
                });
                return { url, requestBody: jsonString, statusCode, userAgent: getUA() };
            } catch (e: any) {
                await sendError(String(e?.message ?? e), "Sst.trackEvent", "NetworkError");
                return null;
            }
        },
    };
})();