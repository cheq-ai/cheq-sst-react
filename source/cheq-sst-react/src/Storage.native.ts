import { UUID_KEY } from "./Info";
import { getAsyncStorage } from "./platform/optionalModules";
import { reportSstErrorOnce } from "./utils/errorReporter";
import { debug } from "./utils/logger";

type KV = Record<string, string>;
type Primitive = string | number | boolean | null;
type KVInput = Record<string, Primitive>;

// Synchronous cache over AsyncStorage, which is async while the public getters are not:
// hydrate once, read from memory, write through in the background. Mirrors the Swift SDK's
// UserDefaults-backed storage. Degrades to memory-only without the optional peer.
let memoryStore: Record<string, string> = {};

// Only our own namespaces are hydrated; the host app's AsyncStorage keys are left alone.
const PERSIST_PREFIX = "cheq.sst.";
let hydration: Promise<void> | null = null;
let hydrated = false;

// Removed while hydration is in flight; hydration must not restore these from disk.
const removedDuringHydration = new Set<string>();
const clearedDuringHydration = new Set<string>();

function noteRemoved(keys: string[]): void {
    if (hydrated) return;
    for (const k of keys) removedDuringHydration.add(k);
}

function noteCleared(prefix: string): void {
    if (hydrated) return;
    clearedDuringHydration.add(prefix);
}

function removedBeforeHydration(key: string): boolean {
    if (removedDuringHydration.has(key)) return true;
    for (const p of clearedDuringHydration) if (key.startsWith(p)) return true;
    return false;
}

function persistable(key: string): boolean {
    return key.startsWith(PERSIST_PREFIX);
}

type Store = NonNullable<ReturnType<typeof getAsyncStorage>>;

// AsyncStorage v3 has getMany/removeMany; v1/v2 have multiGet/multiRemove.
function readMany(store: Store, keys: string[]): Promise<Record<string, string | null>> {
    if ("getMany" in store) return store.getMany(keys);
    return store.multiGet(keys).then(entries =>
        Object.fromEntries(entries.map(([key, value]) => [key, value ?? null])));
}

function removeMany(store: Store, keys: string[]): Promise<void> {
    if ("removeMany" in store) return store.removeMany(keys);
    return store.multiRemove(keys);
}

// debug() is off in production; beacon once per session so a failing peer is visible.
function reportStorageFailure(key: string, fn: string, what: string, error: unknown): void {
    debug(what, { error });
    const message = error instanceof Error ? error.message : String(error);
    reportSstErrorOnce(key, `${what}: ${message}`, fn, "storageError");
}

function writeThrough(op: (store: Store) => Promise<unknown>): void {
    const store = getAsyncStorage();
    if (!store) return;
    // Fire and forget: a failed write costs persistence, and must never fail a trackEvent.
    // `.catch` stays inside the try: it throws itself if op() returns a non-promise.
    const failed = (error: unknown) =>
        reportStorageFailure("storageWriteFailed", "Storage.writeThrough", "AsyncStorage write failed", error);
    try {
        void op(store).catch(failed);
    }
    catch (error) {
        failed(error);
    }
}

/** Loads persisted values into the cache. Idempotent; await before reading the uuid. */
export function hydrateStorage(): Promise<void> {
    if (hydration) return hydration;

    hydration = (async () => {
        const store = getAsyncStorage();
        if (!store) return;

        try {
            const keys = (await store.getAllKeys()).filter(persistable);
            if (keys.length === 0) return;

            for (const [key, value] of Object.entries(await readMany(store, keys))) {
                // Anything written or removed since hydration started is newer than disk.
                if (value === null || key in memoryStore || removedBeforeHydration(key)) continue;
                memoryStore[key] = value;
            }
            debug("Storage hydrated", { keys: keys.length });
        }
        catch (error) {
            reportStorageFailure("storageHydrationFailed", "Storage.hydrateStorage", "AsyncStorage hydration failed", error);
        }
        finally {
            hydrated = true;
            removedDuringHydration.clear();
            clearedDuringHydration.clear();
        }
    })();

    return hydration;
}

function toStoredValue(value: Primitive | undefined): string | null {
    if (value === undefined) return null;
    return value === null ? "null" : String(value);
}

export class SstStorage {
    constructor(private prefix: string, private keyName: "name" | "key") {}

    add(key: string, value: Primitive): void;
    add(values: KVInput): void;

    add(arg1: string | KVInput, arg2?: Primitive): void {
        if (typeof arg1 === "string") {
            this._addOne(arg1, arg2);
            return;
        }

        for (const [k, v] of Object.entries(arg1)) {
            this._addOne(k, v);
        }
    }

    all(): KV {
        const out: KV = {};
        const p = `${this.prefix}:`;

        for (const [k, v] of Object.entries(memoryStore)) {
            if (!k.startsWith(p)) continue;
            out[k.slice(p.length)] = v;
        }

        return out;
    }

    get(key: string): string | null {
        return getStorageItem(this._k(key));
    }

    remove(key: string): void {
        removeStorageItem(this._k(key));
    }

    clear(): void {
        const p = `${this.prefix}:`;
        const cached = Object.keys(memoryStore).filter(k => k.startsWith(p));
        for (const k of cached) delete memoryStore[k];
        noteCleared(p);
        // Disk may hold keys the cache never saw; keys back in memory were re-added since.
        writeThrough(async (store) => {
            // Fall back to the cached keys so a failed scan still removes what we know about.
            // try/catch (not .catch) so a sync throw or non-thenable return takes the same path.
            let onDisk: string[] = [];
            try {
                onDisk = (await store.getAllKeys()).filter(k => k.startsWith(p));
            }
            catch (error) {
                reportStorageFailure("storageClearScanFailed", "Storage.clear", "AsyncStorage key scan failed", error);
            }
            const stale = [...new Set([...cached, ...onDisk])].filter(k => !(k in memoryStore));
            if (stale.length) await removeMany(store, stale);
        });
    }

    // Mirrors web eventData() shape if you want it consistent
    eventData(): Array<Record<string, string>> | null {
        const data = this.all();
        if (!data || Object.keys(data).length === 0) return null;
        return Object.keys(data).map(k => ({
            [this.keyName]: k,
            value: data[k],
        }));
    }

    private _addOne(key: string, value: Primitive | undefined): void {
        const stored = toStoredValue(value);
        if (stored === null) return;
        setStorageItem(this._k(key), stored);
    }

    private _k(key: string): string {
        return `${this.prefix}:${key}`;
    }
}

export class Cookies extends SstStorage {
    constructor() {
        super("cheq.sst.storage.cookie", "name");
    }
}

export class LocalStorage extends SstStorage {
    constructor() {
        super("cheq.sst.storage.local", "key");
    }
}

export class SessionStorage extends SstStorage {
    constructor() {
        super("cheq.sst.storage.session", "key");
    }
}

export function getStorageItem(key: string): string | null {
    return memoryStore[key] ?? null;
}

export function setStorageItem(key: string, value: string): void {
    memoryStore[key] = value;
    if (persistable(key)) writeThrough((store) => store.setItem(key, value));
}

export function removeStorageItem(key: string): void {
    delete memoryStore[key];
    if (!persistable(key)) return;
    noteRemoved([key]);
    writeThrough((store) => store.removeItem(key));
}

// Keep UUID global (un-prefixed) unless you want it scoped too
export function getUUID(): string | null {
    return getStorageItem(UUID_KEY);
}

export function clearUUID(): void {
    removeStorageItem(UUID_KEY);
}