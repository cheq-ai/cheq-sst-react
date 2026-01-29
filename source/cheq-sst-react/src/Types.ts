import { Models } from "./Models";

export type TrackEventResult = {
    url: string;
    requestBody: string;
    statusCode?: number | null;
    userAgent?: string | null;
};

export type MobileData = {
    app?: AppInfo | null;
    device?: DeviceInfoPayload | null;
};

export type ScreenInfo = {
    width: number | null;
    height: number | null;
    orientation: string | null;
};

export type OSInfo = {
    name: string;
    version: string;
};

export type AppInfo = {
    name: string | null;
    version: string | null;
    build: string | null;
    namespace: string | null;
};

export type DeviceOS = {
    name: string | null;
    version: string | null;
};

export type DeviceScreen = {
    width: number | null;
    height: number | null;
    orientation: string | null;
};

export type DeviceInfoPayload = {
    manufacturer: string | null;
    model: string | null;
    architecture: string | null;
    screen: DeviceScreen | null;
    os: DeviceOS | null;
};

export interface DateProvider {
    now(): Date;
}

export class SystemDateProvider implements DateProvider {
    now() {
        return new Date();
    }
}

export class VirtualBrowser {
    readonly page?: string;
    readonly userAgent?: string;
    constructor(page?: string, userAgent?: string) {
        this.page = page;
        this.userAgent = userAgent;
    }
}

export type DeviceModelConfig = {
    screenEnabled: boolean;
    osEnabled: boolean;
    idEnabled: boolean;
};

export type ConfigInit = {
    domain?: string;
    nexusHost?: string;
    publishPath?: string;
    dataLayerName?: string;
    virtualBrowser?: VirtualBrowser;
    debug?: boolean;
    screenEnabled?: boolean;
    dateProvider?: DateProvider;
    models?: Models;
};

export type EventInit = {
    data?: Record<string, unknown>;
    parameters?: Record<string, string>;
};

export class Config {
    readonly clientName: string;
    readonly domain: string;
    readonly nexusHost: string;
    readonly publishPath: string;
    readonly dataLayerName: string;
    readonly virtualBrowser: VirtualBrowser;
    readonly debug: boolean;
    readonly screenEnabled: boolean;
    readonly dateProvider: DateProvider;
    readonly models: Models;

    constructor(clientName: string, init: ConfigInit = {}) {
        this.clientName = clientName;
        this.domain = init.domain ?? "t.nc0.co";
        this.nexusHost = init.nexusHost ?? "nexus.ensighten.com";
        this.publishPath = init.publishPath ?? "sst";
        this.dataLayerName = init.dataLayerName ?? "digitalData";
        this.virtualBrowser = init.virtualBrowser ?? new VirtualBrowser();
        this.debug = init.debug ?? false;
        this.screenEnabled = init.screenEnabled ?? true;
        this.dateProvider = init.dateProvider ?? new SystemDateProvider();
        this.models = init.models ?? Models.default();
    }
}

export class SstError extends Error {
    static notConfigured() {
        return new SstError("Sst not configured. Call Sst.configure() first.");
    }
}

export type AsyncStorageLike = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
};

export type CachedEnv = {
    language: string | null;
    timezone: string | null;
    screen: { width: number | null; height: number | null };
    screenDepth: number | null;
};