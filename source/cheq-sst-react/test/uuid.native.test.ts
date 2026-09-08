import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// HTTP.native.ts imports react-native modules that do not resolve under the node test
// environment; the uuid handling under test does not depend on either.
vi.mock("react-native-device-info", () => ({ default: { getUserAgent: () => "test-ua" } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const UUID = "e255d5bb-d612-4630-af26-dfde184660d4";
// Distinct from UUID so tests can tell *which* segment the parser picked.
const OTHER = "11112222-3333-4444-5555-666677778888";

let fetchMock: ReturnType<typeof vi.fn>;
let sendHttpPost: typeof import("../src/platform/HTTP")["sendHttpPost"];
let getStorageItem: typeof import("../src/Storage")["getStorageItem"];
let removeStorageItem: typeof import("../src/Storage")["removeStorageItem"];
let UUID_KEY: string;

function respondWith(uuidHeader: string | null) {
    const headers = new Headers();
    if (uuidHeader !== null) headers.set("x-offsite-uuid", uuidHeader);
    return new Response("{}", { status: 200, headers });
}

function sentCookie(callIndex = 0): string | undefined {
    const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
    return (init?.headers as Record<string, string> | undefined)?.["Cookie"];
}

beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn(async () => respondWith(UUID));
    vi.stubGlobal("fetch", fetchMock);

    ({ sendHttpPost } = await import("../src/platform/HTTP"));
    ({ getStorageItem, removeStorageItem } = await import("../src/Storage"));
    ({ UUID_KEY } = await import("../src/Info"));
    removeStorageItem(UUID_KEY);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const post = () => sendHttpPost({ url: "https://example.com/sst", jsonString: "{}", userAgent: "ua" });

describe("native uuid round-trip", () => {
    it("stores the uuid from a well-formed response", async () => {
        await post();
        expect(getStorageItem(UUID_KEY)).toBe(UUID);
    });

    it("sends the stored uuid as a single bare cookie", async () => {
        await post();
        await post();

        // Nothing stored yet on the first request; the second carries exactly one value.
        expect(sentCookie(0)).toBeUndefined();
        expect(sentCookie(1)).toBe(`uuid=${UUID}`);
    });

    it("opts out of the platform cookie jar so iOS cannot append a second copy", async () => {
        await post();

        // Without this, RCTNetworking pre-fills Cookie from NSHTTPCookieStorage and our
        // header is appended to it, producing `uuid=X,uuid=X`.
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.credentials).toBe("omit");
    });

    it("does not accumulate against a collector that reflects the cookie it receives", async () => {
        // Models the real failure: the collector echoes back whatever `uuid` cookie it was
        // sent. A constant-response mock cannot reproduce this -- growth only appears when
        // the response depends on the request.
        let reflected: string | null = null;
        fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
            const sent = (init.headers as Record<string, string>)["Cookie"];
            // The collector reflects the cookie value it was sent, minting one if absent.
            // That is what turned a duplicated cookie into permanent growth in production.
            reflected = sent ? sent.replace(/^uuid=/, "") : UUID;
            return respondWith(reflected);
        });

        for (let i = 0; i < 25; i++) await post();

        // Fails if a second copy ever reaches the wire: the reflected value would then carry
        // a comma and gain a segment per request.
        expect(reflected).toBe(UUID);
        expect(reflected).not.toContain(",");
        expect(getStorageItem(UUID_KEY)).toBe(UUID);
        expect(sentCookie(24)).toBe(`uuid=${UUID}`);
    });

    it("unwraps a cookie-shaped reflected value", async () => {
        fetchMock.mockImplementation(async () => respondWith(`uuid=${UUID}`));

        await post();
        expect(getStorageItem(UUID_KEY)).toBe(UUID);
    });

    it("takes the first value when duplicate headers are comma-joined", async () => {
        const headers = new Headers();
        headers.append("x-offsite-uuid", UUID);
        headers.append("x-offsite-uuid", OTHER);
        fetchMock.mockImplementation(async () => new Response("{}", { status: 200, headers }));

        await post();

        // Distinct values, so this fails if the parser ever takes the last segment instead.
        expect(getStorageItem(UUID_KEY)).toBe(UUID);
    });

    it("does not fall back to a later segment when the first is invalid", async () => {
        fetchMock.mockImplementation(async () => respondWith(`junk, ${OTHER}`));

        await post();

        // First-wins is deliberate: a later segment is not more trustworthy than the first.
        expect(getStorageItem(UUID_KEY)).toBeNull();
    });

    it("rejects an already-accumulated value instead of replaying it", async () => {
        const poisoned = `${UUID}` + `,uuid=${OTHER}`.repeat(60);
        fetchMock.mockImplementationOnce(async () => respondWith(poisoned));

        await post();
        // The first segment is a valid uuid, so the accumulated tail must be dropped, not stored.
        expect(getStorageItem(UUID_KEY)).toBe(UUID);

        await post();
        expect(sentCookie(1)).toBe(`uuid=${UUID}`);
    });

    it.each([
        ["one char short in the final group", "e255d5bb-d612-4630-af26-dfde184660d"],
        ["one char long in the final group", "e255d5bb-d612-4630-af26-dfde184660d44"],
        ["a non-hex character", "e255d5bb-d612-4630-af26-dfde184660dg"],
        ["Set-Cookie attributes appended", "e255d5bb-d612-4630-af26-dfde184660d4; Path=/; HttpOnly"],
        ["surrounding junk", "prefix e255d5bb-d612-4630-af26-dfde184660d4 suffix"],
        ["dashes but wrong group sizes", "e255d5b-bd612-4630-af26-dfde184660d4"],
    ])("rejects a near-miss: %s", async (_label, header) => {
        // These are what the anchored, group-sized regex is actually for -- a looser check
        // (hex-and-dashes, or unanchored) would store them and poison getCheqUuid().
        fetchMock.mockImplementation(async () => respondWith(header));

        await post();

        expect(getStorageItem(UUID_KEY)).toBeNull();
    });

    it("accepts an uppercase uuid, storing it verbatim", async () => {
        fetchMock.mockImplementation(async () => respondWith(UUID.toUpperCase()));

        await post();

        // Pinning current behavior: the regex is case-insensitive and does not normalize.
        expect(getStorageItem(UUID_KEY)).toBe(UUID.toUpperCase());
    });

    it("keeps a previously stored uuid when a response omits the header", async () => {
        await post();
        fetchMock.mockImplementation(async () => respondWith(null));

        await post();

        expect(getStorageItem(UUID_KEY)).toBe(UUID);
    });

    it("ignores a non-uuid header rather than poisoning storage", async () => {
        fetchMock.mockImplementation(async () => respondWith("not-a-uuid"));

        await post();
        expect(getStorageItem(UUID_KEY)).toBeNull();
        await post();
        expect(sentCookie(1)).toBeUndefined();
    });

    it("leaves a good stored uuid intact when a later response is malformed", async () => {
        await post();
        fetchMock.mockImplementation(async () => respondWith("garbage"));

        await post();
        expect(getStorageItem(UUID_KEY)).toBe(UUID);
    });
});
