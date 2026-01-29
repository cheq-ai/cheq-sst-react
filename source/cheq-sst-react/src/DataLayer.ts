import { convertToJSONString } from "./JSON";
import { AsyncStorageLike } from "./Types"

type Domain = Record<string, string>;

let AsyncStorage: AsyncStorageLike | null = null;
export function setAsyncStorage(adapter: AsyncStorageLike) {
    AsyncStorage = adapter;
}

const memory = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
    if (AsyncStorage) return AsyncStorage.getItem(key);
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    return memory.has(key) ? memory.get(key)! : null;
}

async function setItem(key: string, value: string): Promise<void> {
    if (AsyncStorage) return AsyncStorage.setItem(key, value);
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
        return;
    }
    memory.set(key, value);
}

export class DataLayer {
    private suiteName = "cheq.sst.datalayer";

    private async getDomain(): Promise<Domain> {
        const raw = await getItem(this.suiteName);
        if (!raw) return {};
        try {
            return JSON.parse(raw) as Domain;
        } catch {
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
            } catch {
                // ignore malformed
            }
        }
        return out;
    }

    async get(key: string): Promise<unknown> {
        const domain = await this.getDomain();
        const raw = domain[key];
        if (!raw) return undefined;
        try {
            return JSON.parse(raw)?.value;
        } catch {
            return undefined;
        }
    }

    async add(key: string, value: unknown): Promise<void> {
        const domain = await this.getDomain();
        domain[key] = convertToJSONString({ value });
        await this.setDomain(domain);
    }

    async remove(key: string): Promise<boolean> {
        const domain = await this.getDomain();
        if (!(key in domain)) return false;
        delete domain[key];
        await this.setDomain(domain);
        return true;
    }

    async clear(): Promise<void> {
        await this.setDomain({});
    }
}