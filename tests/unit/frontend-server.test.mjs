// @vitest-environment node
import { describe, expect, test } from "vitest";
import { contentSecurityPolicy } from "../../frontend/server.mjs";

describe("frontend server security headers", () => {
  test("allows API origin for uploaded images", () => {
    const policy = contentSecurityPolicy({
      apiBaseUrl: "http://127.0.0.1:3002",
      sentryIngestOrigin: ""
    });

    expect(policy).toContain("img-src 'self' data: blob: http://127.0.0.1:3002");
  });
});
