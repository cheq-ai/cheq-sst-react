import { UUID_KEY } from "./Info";

type KV = Record<string, string>;

export class SstStorage {
    add(key: string, value: string) {}
    all(): KV { return {}; }
    get(key: string): string | null { return null; }
    remove(key: string) {}
    clear() {}
    eventData(): Array<Record<string, string>> | null { return null; }
}

export class Cookies extends SstStorage {}
export class LocalStorage extends SstStorage {}
export class SessionStorage extends SstStorage {}

let memoryStore: Record<string, string> = {};

export function getStorageItem(key: string): string | null {
    return memoryStore[key] ?? null;
}

export function setStorageItem(key: string, value: string): void {
    memoryStore[key] = value;
}

export function removeStorageItem(key: string): void {
    delete memoryStore[key];
}

export function getUUID(): string | null {
    return getStorageItem(UUID_KEY);
}

export function clearUUID(): void {
    removeStorageItem(UUID_KEY);
}