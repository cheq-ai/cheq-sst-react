import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendErrorArgs, SendHttpPostArgs } from "../src/Types";

// The error beacon sends the SST URL as the `Referer` header on native
// (see platform/HTTP.native.ts), so sstVersion has to survive that path too.
// vi.hoisted keeps these defined before vi.mock's factory is hoisted above the imports.
const http = vi.hoisted(() => ({
    sendErrorBeacon: vi.fn<(args: SendErrorArgs) => boolean>(),
    sendHttpPost: vi.fn<(args: SendHttpPostArgs) => Promise<number>>(),
}));

vi.mock("../src/platform/HTTP", () => http);

import { Config, Sst } from "../src/index";

const EXPECTED_SST_VERSION = "1.0.0";

function beaconReferrer(): URL {
    expect(http.sendErrorBeacon).toHaveBeenCalledOnce();
    return new URL(http.sendErrorBeacon.mock.calls[0][0].referrer);
}

beforeEach(() => {
    vi.clearAllMocks();
    http.sendErrorBeacon.mockReturnValue(true);
    http.sendHttpPost.mockResolvedValue(200);
    Sst.configure(new Config("testclient"));
});

describe("sstVersion on the error beacon referrer", () => {
    it("is on the referrer built for sendError", async () => {
        await Sst.sendError("boom", "Sst.trackEvent", "networkError");

        expect(beaconReferrer().searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
    });

    it("is on the referrer even when message and fn are oversized", async () => {
        await Sst.sendError("x".repeat(5000), "y".repeat(5000), "serializationError");

        expect(beaconReferrer().searchParams.get("sstVersion")).toBe(EXPECTED_SST_VERSION);
    });
});
