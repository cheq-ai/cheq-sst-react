import { UUID_KEY } from "./Info";

type KV = Record<string, string>;
type Primitive = string | number | boolean | null;
type KVInput = Record<string, Primitive>;

let memoryStore: Record<string, string> = {};

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
        for (const k of Object.keys(memoryStore)) {
            if (k.startsWith(p)) delete memoryStore[k];
        }
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
}

export function removeStorageItem(key: string): void {
    delete memoryStore[key];
}

// Keep UUID global (un-prefixed) unless you want it scoped too
export function getUUID(): string | null {
    return getStorageItem(UUID_KEY);
}

export function clearUUID(): void {
    removeStorageItem(UUID_KEY);
}