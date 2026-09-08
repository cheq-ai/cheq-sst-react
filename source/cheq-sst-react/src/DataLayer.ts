import { convertToJSONString } from "./JSON";
import { AsyncStorageLike } from "./Types"
import { debug } from "./utils/logger";
import { reportSstError } from "./utils/errorReporter";

type Domain = Record<string, string>;

let AsyncStorage: AsyncStorageLike | null = null;
export function setAsyncStorage(adapter: AsyncStorageLike) {
    AsyncStorage = adapter;
}

const memory = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
    try {
        if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

        if (AsyncStorage) return AsyncStorage.getItem(key);
        if (typeof localStorage !== "undefined") return localStorage.getItem(key);
        return memory.has(key) ? memory.get(key)! : null;
    }
    catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        reportSstError(`DataLayer.getItem failed for key "${key}": ${error.message}`, "DataLayer.getItem", "serializationError");
        throw error;
    }
}

async function setItem(key: string, value: string): Promise<void> {
    try {
        if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

        if (AsyncStorage) return AsyncStorage.setItem(key, value);
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(key, value);
            return;
        }
        memory.set(key, value);
    }
    catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        reportSstError(`DataLayer.setItem failed for key "${key}": ${error.message}`, "DataLayer.setItem", "serializationError");
        throw error;
    }
}

export class DataLayer {
    private suiteName = "cheq.sst.datalayer";

    private async getDomain(): Promise<Domain> {
        const raw = await getItem(this.suiteName);
        if (!raw) return {};
        try {
            return JSON.parse(raw) as Domain;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            reportSstError(`DataLayer.getDomain: corrupt storage, resetting: ${error.message}`, "DataLayer.getDomain", "serializationError");
            return {};
        }
    }

    private async setDomain(domain: Domain): Promise<void> {
        await setItem(this.suiteName, JSON.stringify(domain));
    }

    async all(): Promise<Record<string, unknown>> {
        const domain = await this.getDomain();
        const out: Record<string, unknown> = {};
        for (const [k, raw] of Object.entries(domain)) {
            try {
                out[k] = JSON.parse(raw)?.value;
            }
            catch (err) {
                debug(`DataLayer.all: skipping corrupt entry for key "${k}"`, err);
            }
        }
        return out;
    }

    async get(key: string): Promise<unknown> {
        try {
            if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

            const domain = await this.getDomain();
            const raw = domain[key];
            if (!raw) return undefined;
            try {
                return JSON.parse(raw)?.value;
            }
            catch {
                return undefined;
            }
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportSstError(`Sst.dataLayer.get failed for key "${key}": ${message}`, "Sst.dataLayer.get", "serializationError");
            throw err;
        }
    }

    async add(key: string, value: unknown): Promise<void> {
        try {
            if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

            const domain = await this.getDomain();
            domain[key] = convertToJSONString({ value });
            await this.setDomain(domain);
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportSstError(`Sst.dataLayer.add failed for key "${key}": ${message}`, "Sst.dataLayer.add", "serializationError");
            throw err;
        }
    }

    async remove(key: string): Promise<boolean> {
        try {
            if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

            const domain = await this.getDomain();
            if (!(key in domain)) return false;
            delete domain[key];
            await this.setDomain(domain);
            return true;
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportSstError(`Sst.dataLayer.remove failed for key "${key}": ${message}`, "Sst.dataLayer.remove", "serializationError");
            throw err;
        }
    }

    async clear(): Promise<void> {
        await this.setDomain({});
    }
}