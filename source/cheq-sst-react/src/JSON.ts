function sortKeysDeep(v: any): any {
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    if (v && typeof v === "object") {
        const out: Record<string, any> = {};
        Object.keys(v).sort().forEach(k => (out[k] = sortKeysDeep(v[k])));
        return out;
    }
    return v;
}

export function convertToJSONString(dictionary: Record<string, any>): string {
    const sorted = sortKeysDeep(dictionary);
    return JSON.stringify(sorted);
}