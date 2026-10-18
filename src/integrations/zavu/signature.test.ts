import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyZavuSignature } from "./signature";

const SECRET = "whsec_test_secret";
const NOW_S = 1_800_000_000;
const BODY = '{"id":"evt_1","type":"message.inbound","data":{}}';

const hmac = (payload: string, secret = SECRET) => createHmac("sha256", secret).update(payload).digest("hex");
const v2Header = (t: number, body = BODY, secret = SECRET) => `t=${t},v2=${hmac(`${t}.${body}`, secret)}`;

const check = (header: string | null, rawBody = BODY) => verifyZavuSignature({ rawBody, header, secret: SECRET, nowMs: NOW_S * 1000 });

describe("verifyZavuSignature", () => {
  it("accepts a valid v2 signature", () => {
    expect(check(v2Header(NOW_S))).toEqual({ valid: true });
  });

  it("rejects v1 because its timestamp is not authenticated", () => {
    expect(check(`t=${NOW_S},v1=${hmac(BODY)}`)).toEqual({ valid: false, reason: "malformed_header" });
  });

  it("prefers v2 when both are present", () => {
    expect(check(`t=${NOW_S},v1=${"0".repeat(64)},v2=${hmac(`${NOW_S}.${BODY}`)}`)).toEqual({ valid: true });
  });

  it("rejects a missing header", () => {
    expect(check(null)).toEqual({ valid: false, reason: "missing_header" });
  });

  it("rejects headers without a timestamp or a signature", () => {
    expect(check(`v2=${hmac(BODY)}`)).toEqual({ valid: false, reason: "malformed_header" });
    expect(check(`t=${NOW_S}`)).toEqual({ valid: false, reason: "malformed_header" });
    expect(check("garbage")).toEqual({ valid: false, reason: "malformed_header" });
  });

  it("rejects a modified body", () => {
    expect(check(v2Header(NOW_S), BODY.replace("evt_1", "evt_2"))).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature made with another secret", () => {
    expect(check(v2Header(NOW_S, BODY, "whsec_other"))).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(check(`t=${NOW_S},v2=abc`)).toEqual({ valid: false, reason: "mismatch" });
  });

  it("accepts deliveries at the edge of the five-minute replay window", () => {
    expect(check(v2Header(NOW_S - 300))).toEqual({ valid: true });
    expect(check(v2Header(NOW_S + 300))).toEqual({ valid: true });
  });

  it("rejects replayed or future deliveries outside the window", () => {
    expect(check(v2Header(NOW_S - 301))).toEqual({ valid: false, reason: "stale_timestamp" });
    expect(check(v2Header(NOW_S + 301))).toEqual({ valid: false, reason: "stale_timestamp" });
  });
});
