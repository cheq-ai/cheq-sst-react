import { convertToJSONString } from "./JSON";
import { getAsyncStorage } from "./platform/optionalModules";
import { debug } from "./utils/logger";
import { reportSstError, reportSstErrorOnce } from "./utils/errorReporter";

type Domain = Record<string, string>;

// Native: AsyncStorage (optional peer). Web: localStorage. Otherwise memory, which resets per launch.
const memory = new Map<string, string>();

// Failures getItem/setItem already beaconed (throttled, as storageError); the public API must not
// re-report them, or a persistent outage beacons unthrottled and mis-tagged on every call.
const storageErrors = new WeakSet<Error>();

function reportOperationError(err: unknown, message: string, fn: string): void {
    if (err instanceof Error && storageErrors.has(err)) return;
    reportSstError(message, fn, "serializationError");
}

async function getItem(key: string): Promise<string | null> {
    try {
        if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

        const store = getAsyncStorage();
        if (store) return await store.getItem(key);
        if (typeof localStorage !== "undefined") return localStorage.getItem(key);
        return memory.has(key) ? memory.get(key)! : null;
    }
    catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        // trackEvent reads on every event, so a persistent bridge failure would beacon per event.
        reportSstErrorOnce("dataLayerReadFailed", `DataLayer.getItem failed for key "${key}": ${error.message}`, "DataLayer.getItem", "storageError");
        storageErrors.add(error);
        throw error;
    }
}

async function setItem(key: string, value: string): Promise<void> {
    try {
        if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

        const store = getAsyncStorage();
        if (store) {
            await store.setItem(key, value);
            return;
        }
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(key, value);
            return;
        }
        memory.set(key, value);
    }
    catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        reportSstErrorOnce("dataLayerWriteFailed", `DataLayer.setItem failed for key "${key}": ${error.message}`, "DataLayer.setItem", "storageError");
        storageErrors.add(error);
        throw error;
    }
}

// Domain mutations are read-modify-write over one blob, so they run one at a time.
let mutations: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
    const next = mutations.then(op, op);
    mutations = next.catch(() => {});
    return next;
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
            // trackEvent reads on every event, and a corrupt blob stays corrupt until the next mutation rewrites it.
            reportSstErrorOnce("dataLayerCorrupt", `DataLayer.getDomain: corrupt storage, treating as empty: ${error.message}`, "DataLayer.getDomain", "serializationError");
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
            reportOperationError(err, `Sst.dataLayer.get failed for key "${key}": ${message}`, "Sst.dataLayer.get");
            throw err;
        }
    }

    async add(key: string, value: unknown): Promise<void> {
        try {
            if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

            await serialize(async () => {
                const domain = await this.getDomain();
                domain[key] = convertToJSONString({ value });
                await this.setDomain(domain);
            });
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportOperationError(err, `Sst.dataLayer.add failed for key "${key}": ${message}`, "Sst.dataLayer.add");
            throw err;
        }
    }

    async remove(key: string): Promise<boolean> {
        try {
            if (!key || typeof key !== "string") throw new TypeError("key is required and must be a non-empty string");

            return await serialize(async () => {
                const domain = await this.getDomain();
                if (!(key in domain)) return false;
                delete domain[key];
                await this.setDomain(domain);
                return true;
            });
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportOperationError(err, `Sst.dataLayer.remove failed for key "${key}": ${message}`, "Sst.dataLayer.remove");
            throw err;
        }
    }

    async clear(): Promise<void> {
        try {
            await serialize(() => this.setDomain({}));
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            reportOperationError(err, `Sst.dataLayer.clear failed: ${message}`, "Sst.dataLayer.clear");
            throw err;
        }
    }
}