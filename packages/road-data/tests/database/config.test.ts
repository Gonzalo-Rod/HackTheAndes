import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { test } from "vitest";
import { parseDatabaseConfiguration } from "../../src/config/env.ts";

test("configuration errors name variables without exposing their values", () => {
  assert.throws(
    () => parseDatabaseConfiguration({ DATABASE_URL: "sensitive-invalid-url" }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("DATABASE_URL") &&
      !error.message.includes("sensitive-invalid-url"),
  );
});
test("unencrypted connections are restricted to loopback test databases", () => {
  assert.throws(() =>
    parseDatabaseConfiguration({
      DATABASE_URL: "postgresql://example.com/postgres",
      DATABASE_SSL_MODE: "disable",
    }),
  );
  assert.equal(
    parseDatabaseConfiguration({
      DATABASE_URL: "postgresql://localhost/peruroad_test",
      DATABASE_SSL_MODE: "disable",
    }).DATABASE_SSL_MODE,
    "disable",
  );
  assert.throws(() =>
    parseDatabaseConfiguration({
      DATABASE_URL: "postgresql://example.com/postgres?sslmode=no-verify",
    }),
  );
});
test("the bundled public Supabase CA matches the provider distribution fingerprint", () => {
  const certificate = new X509Certificate(
    readFileSync(new URL("../../certs/supabase-prod-ca-2021.crt", import.meta.url)),
  );
  assert.equal(certificate.ca, true);
  assert.equal(
    certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
    "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
  );
});
