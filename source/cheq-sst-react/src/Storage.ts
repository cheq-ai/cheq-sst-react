/**
 * Web storage equivalents:
 * - Cookies: (Swift cookie storage) → stored in localStorage with a prefix
 * - LocalStorage: → localStorage with a prefix
 * - SessionStorage: → sessionStorage with a prefix
 */

import { UUID_KEY } from "./Info";
type KV = Record<string, string>;

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

    add(key: string, value: string) {
        this.store.set(key, value);
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
}

export class Cookies extends SstStorage {
    constructor() {
        super(new PrefixedStorage(localStorage, "cheq.sst.storage.cookie"), "name");
    }
}
export class LocalStorage extends SstStorage {
    constructor() {
        super(new PrefixedStorage(localStorage, "cheq.sst.storage.local"), "key");
    }
}
export class SessionStorage extends SstStorage {
    constructor() {
        super(new PrefixedStorage(sessionStorage, "cheq.sst.storage.session"), "key");
    }
}

const window_exists = typeof window !== "undefined";
export function getStorageItem(key: string): string | null {
    return window_exists ? localStorage.getItem(key) : null;
}

export function setStorageItem(key: string, value: string): void {
    if (window_exists) {
        localStorage.setItem(key, value);
    }
}

export function removeStorageItem(key: string): void {
    if (window_exists) {
        localStorage.removeItem(key);
    }
}
export function getUUID() {
    return getStorageItem(UUID_KEY);
}

export function clearUUID() {
    return removeStorageItem(UUID_KEY);
}