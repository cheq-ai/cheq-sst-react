import { CachedEnv, Config, SstError, SstErrorKind, TrackEventResult } from "./Types";
import { Event } from "./Models";
import { DataLayer, setErrorReporter } from "./DataLayer";
import { Cookies, LocalStorage, SessionStorage, clearUUID, getUUID } from "./Storage";
import { sendHttpPost, sendErrorBeacon } from "./platform/HTTP";
import { getPlatform } from "./platform/env";
import { getLanguage, getPageTitle, getPageURL, getReferrer, getScreenInfo, getScreenDepth, getTimezone } from "./platform/virtualBrowser";
import { debug, setDebug } from "./utils/logger";

const SST_VERSION = "0.1.1";
const SST_ORIGIN = "mobile"; // "mobile" should be used for all traffic from this SDK, including react web.
let cachedEnv: CachedEnv | null = null;
let resizeListenerRegistered = false;

// Lazily initialized on first use to avoid module-level side effects.
let baseParams: Record<string, string> | null = null;
function getBaseParams(): Record<string, string> {
    if (!baseParams) {
        baseParams = {
            sstVersion: SST_VERSION,
            sstOrigin: SST_ORIGIN,
            sstPlatform: getPlatform()
        };
    }
    return baseParams;
}

function registerResizeListenerOnce() {
    if (resizeListenerRegistered) return;

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", () => {
            cachedEnv = null;
        }, { passive: true });
    }
    resizeListenerRegistered = true;
}

function getCachedEnv(screenEnabled: boolean): CachedEnv {
    if (cachedEnv) return cachedEnv;

    cachedEnv = {
        language: getLanguage(),
        timezone: getTimezone(),
        screen: screenEnabled ? getScreenInfo() : { width: null, height: null, orientation: null },
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

function validateClientName(clientName: string): string {
    const response = (clientName ?? "").trim();
    if (!response) throw SstError.invalidConfig("Missing config: clientName");
    if (!/^[A-Za-z0-9_-]+$/.test(response) || (response.length > 256)) throw SstError.invalidConfig("Invalid config: clientName");
    return response;
}

function buildSstUrl(domain: string, clientName: string, params: Record<string, string>): string {
    const cleanDomain = (domain ?? "").trim();
    if (!cleanDomain) throw SstError.invalidConfig("Missing config: domain");

    const cleanClientName = validateClientName(clientName);

    const qs = buildQuery(getBaseParams(), params);
    return new URL(`https://${cleanDomain}/pc/${cleanClientName}/sst?${qs}`).toString();
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

    // Wire DataLayer error reporting back to Sst.sendError, breaking the circular import.
    setErrorReporter((msg, fn, kind) => { sendError(msg, fn, kind).catch((e) => { debug("sendError failed", e); }); });

    function getUA() {
        return config?.virtualBrowser.userAgent ?? userAgent ?? null;
    }

    async function ensureUserAgent() {
        if (!config) return;
        if (!config.virtualBrowser.userAgent && !userAgent) {
            userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
        }
    }

    async function sendError(msg: string, fn: string, kind: SstErrorKind) {
        if (!config) return false;

        let safeClientName: string;
        try {
            safeClientName = validateClientName(config.clientName);
        }
        catch (err) {
            console.error("SST sendError: invalid clientName", err);
            return false;
        }

        const url = buildErrorUrl(config.nexusHost, {
            msg: truncate(msg, 1024),
            fn: truncate(fn, 256),
            client: truncate(safeClientName, 256),
            publishPath: truncate(config.publishPath, 256),
            errorName: truncate(kind, 256),
        });

        const referrer = buildSstUrl(config.domain, safeClientName, {});
        return sendErrorBeacon({ userAgent: getUA(), url, referrer });
    }

    return {
        dataLayer,
        cookies,
        localStorage: localStorageStore,
        sessionStorage: sessionStorageStore,
        sendError: sendError,
        configure(next: Config) {
            setDebug(Boolean(next.debug));
            registerResizeListenerOnce();

            try {
                buildSstUrl(next.domain, next.clientName, {});
                config = next;
                debug("Configured");
            }
            catch(err) {
                const error = err as Error;
                console.error("[CHEQ SST] Invalid config: unable to configure SST");
                throw error;
            }
        },
        getCheqUuid() {
            return getUUID();
        },
        clearCheqUuid() {
            clearUUID();
        },
        getEventData(event: Event) {
            if (!config) return null;

            const event_data: Record<string, any> = { ...event.data };
            if (event_data.__timestamp == null) event_data.__timestamp = config.dateProvider.now().getTime();
            return event_data;
        },
        async getDataLayer(event: Event): Promise<string | unknown | null> {
            if (!config) return null;

            const dataLayerNs: string | undefined = config.dataLayerName;
            if (!dataLayerNs) return null;

            const dataLayerValue: unknown = await dataLayer.all();
            if (!dataLayerValue) return null;
            if (Array.isArray(dataLayerValue) && (dataLayerValue.length === 0)) return null;
            else if ((typeof dataLayerValue === 'object') && (Object.keys(dataLayerValue).length === 0)) return null;

            const response: Record<string, unknown> = { [dataLayerNs]: dataLayerValue };

            // models
            await ensureUserAgent();
            const models = await config.models.collect(event, { config, userAgent: getUA() });
            if ((typeof models === 'object') && Object.keys(models).length > 0) {
                const mobileData: Record<string, unknown> = {};

                // device data
                const deviceData = models.deviceData;
                if (models.deviceData) Object.assign(mobileData, deviceData);

                const library = models.library;
                if (models.library) {
                    const libraryCopy: Record<string, unknown> = { ...library };
                    const libModels = libraryCopy.models;
                    if (Object.keys(libModels || {}).length === 0) {
                        delete libraryCopy.models;
                    }
                    mobileData.library = libraryCopy;
                }

                if (Object.keys(mobileData).length > 0) {
                    response.__mobileData = mobileData;
                }
            }
            return response;
        },
        getSettings() {
            if (!config) return null;

            return { publishPath: config.publishPath, nexusHost: config.nexusHost };
        },
        getStorage() {
            if (!config) return null;

            const out: Record<string, any> = {};
            const c = cookies.eventData();
            const l = localStorageStore.eventData();
            const s = sessionStorageStore.eventData();
            if (c) out.cookies = c;
            if (l) out.localStorage = l;
            if (s) out.sessionStorage = s;
            return Object.keys(out).length ? out : null;
        },
        async getVirtualBrowser() {
            if (!config) return null;

            await ensureUserAgent();
            const env = getCachedEnv(config.screenEnabled);
            const screen = env.screen;
            const language = env.language;
            const timezone = env.timezone;
            const screen_depth = env.screenDepth;

            const page_url = getPageURL();
            const page_title = getPageTitle();
            const referrer = getReferrer();

            const virtualBrowser: Record<string, any> = {};
            virtualBrowser.height = virtualBrowser.screenHeight = screen.height;
            virtualBrowser.width = virtualBrowser.screenWidth = screen.width;
            if (screen.orientation) virtualBrowser.screenOrientation = screen.orientation;
            if (screen_depth) virtualBrowser.screenDepth = screen_depth;
            if (page_url) virtualBrowser.page = page_url;
            if (page_title) virtualBrowser.title = page_title;
            if (referrer) virtualBrowser.referrer = referrer;
            if (language) virtualBrowser.language = language;
            if (timezone) virtualBrowser.timezone = timezone;
            if (config.virtualBrowser.page) virtualBrowser.page = config.virtualBrowser.page;
            return virtualBrowser;
        },
        async trackEvent(event: Event): Promise<TrackEventResult | null> {
            debug(`trackEvent: ${event.name}`);
            if (!config) {
                debug("trackEvent error - missing config");
                return null;
            }

            const sstData: Record<string, any> = {};
            sstData.events = [{ name: event.name, data: this.getEventData(event) }];
            sstData.dataLayer = await this.getDataLayer(event);
            sstData.settings = this.getSettings();
            sstData.storage = this.getStorage();
            sstData.virtualBrowser = await this.getVirtualBrowser();
            
            // cleanup
            Object.entries(sstData).forEach(([key, value]) => {
                if ((value === null) || (value === undefined) || (value === "")) delete sstData[key];
                else if (Array.isArray(value) && (value.length === 0)) delete sstData[key];
                else if ((typeof value === 'object') && (Object.keys(value).length === 0)) delete sstData[key];
            });

            let jsonString: string;
            try {
                jsonString = JSON.stringify(sstData);
            } catch (e: any) {
                await sendError(String(e?.message ?? e), "Sst.trackEvent", "serializationError");
                return null;
            }

            const url = buildSstUrl(config.domain, config.clientName, event.parameters);

            try {
                const statusCode = await sendHttpPost({
                    userAgent: getUA(),
                    url,
                    jsonString,
                });
                return { url, requestBody: jsonString, statusCode, userAgent: getUA() };
            } catch (e: any) {
                await sendError(String(e?.message ?? e), "Sst.trackEvent", "networkError");
                return null;
            }
        },
    };
})();