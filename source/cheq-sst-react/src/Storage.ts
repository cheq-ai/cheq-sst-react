import { UUID_KEY } from "./Info";

type KV = Record<string, string>;
type Primitive = string | number | boolean | null;
type KVInput = Record<string, Primitive>;

function createMemoryStorage(): Storage {
    let store: Record<string, string> = {};

    return {
        get length() {
            return Object.keys(store).length;
        },
        clear() {
            store = {};
        },
        getItem(key: string) {
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        key(index: number) {
            return Object.keys(store)[index] ?? null;
        },
        removeItem(key: string) {
            delete store[key];
        },
        setItem(key: string, value: string) {
            store[key] = String(value);
        },
    };
}

// ---- Memory-only storage areas (separate buckets) ----
const memoryCookiesStorage = createMemoryStorage();
const memoryLocalStorage = createMemoryStorage();
const memorySessionStorage = createMemoryStorage();

// If you want UUID to be shared globally, keep it in "local" memory area:
const memoryGlobalStorage = memoryLocalStorage;

// ---- Always return memory (never browser storage) ----
function getSafeLocalStorage(): Storage {
    return memoryLocalStorage;
}

function getSafeSessionStorage(): Storage {
    return memorySessionStorage;
}

function getSafeCookiesStorage(): Storage {
    return memoryCookiesStorage;
}

class PrefixedStorage {
    constructor(private area: Storage, private prefix: string) {}

    set(key: string, value: string) {
        this.area.setItem(`${this.prefix}:${key}`, value);
    }
    get(key: string): string | null {
        return this.area.getItem(`${this.prefix}:${key}`);
    }
    remove(key: string) {
        this.area.removeItem(`${this.prefix}:${key}`);
    }
    clear() {
        const keys: string[] = [];
        for (let i = 0; i < this.area.length; i++) {
            const k = this.area.key(i);
            if (k?.startsWith(`${this.prefix}:`)) keys.push(k);
        }
        keys.forEach(k => this.area.removeItem(k));
    }
    all(): KV {
        const out: KV = {};
        for (let i = 0; i < this.area.length; i++) {
            const k = this.area.key(i);
            if (!k?.startsWith(`${this.prefix}:`)) continue;
            out[k.slice(this.prefix.length + 1)] = this.area.getItem(k) ?? "";
        }
        return out;
    }
}

export class SstStorage {
    constructor(private store: PrefixedStorage, private keyName: "name" | "key") {}

    add(key: string, value: Primitive): void;
    add(values: KVInput): void;
    add(arg1: string | KVInput, arg2?: Primitive): void {
        if (typeof arg1 === "string") {
            this._add_one(arg1, arg2);
            return;
        }

        for (const [k, v] of Object.entries(arg1)) {
            this._add_one(k, v);
        }
    }

    all(): KV {
        return this.store.all();
    }
    get(key: string) {
        return this.store.get(key);
    }
    remove(key: string) {
        this.store.remove(key);
    }
    clear() {
        this.store.clear();
    }

    eventData(): Array<Record<string, string>> | null {
        const data = this.all();
        const keys = Object.keys(data);
        if (keys.length === 0) return null;
        return keys.map(k => ({ [this.keyName]: k, value: data[k] }));
    }

    private _add_one(key: string, value: Primitive | undefined): void {
        if (value === undefined) return;

        const storedValue = value === null ? "null" : String(value);
        this.store.set(key, storedValue);
    }
}

export class Cookies extends SstStorage {
    constructor() {
        super(new PrefixedStorage(getSafeCookiesStorage(), "cheq.sst.storage.cookie"), "name");
    }
}

export class LocalStorage extends SstStorage {
    constructor() {
        super(new PrefixedStorage(getSafeLocalStorage(), "cheq.sst.storage.local"), "key");
    }
}

export class SessionStorage extends SstStorage {
    constructor() {
        super(new PrefixedStorage(getSafeSessionStorage(), "cheq.sst.storage.session"), "key");
    }
}

// ---- Memory-only "global" helpers (UUID etc.) ----
/** No-op on web: the browser owns persistence, and nothing here outlives the page. */
export function hydrateStorage(): Promise<void> {
    return Promise.resolve();
}

export function getStorageItem(key: string): string | null {
    return memoryGlobalStorage.getItem(key);
}

export function setStorageItem(key: string, value: string): void {
    memoryGlobalStorage.setItem(key, value);
}

export function removeStorageItem(key: string): void {
    memoryGlobalStorage.removeItem(key);
}

export function getUUID() {
    return getStorageItem(UUID_KEY);
}

export function clearUUID() {
    return removeStorageItem(UUID_KEY);
}