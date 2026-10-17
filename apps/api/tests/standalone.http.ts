import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, afterAll, expect, test } from "vitest";

let server: ChildProcess | undefined;
let directory: string | undefined;
let baseUrl = "";
let output = "";
const secret = randomBytes(32).toString("base64url");
const contextSecret = randomBytes(32).toString("base64url");

async function unusedPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const address = listener.address();
  if (!address || typeof address === "string")
    throw new Error("No local test port available");
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "peruroad-api-test-"));
  await cp(new URL("../.next/standalone/", import.meta.url), directory, {
    recursive: true,
  });
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  // This isolated artifact has no live DB/provider credentials. Invalid requests must never connect.
  server = spawn(process.execPath, [join(directory, "apps/api/server.js")], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: "postgresql://unused@127.0.0.1:1/peruroad_test",
      DATABASE_SSL_MODE: "verify-full",
      ROAD_DATA_JOB_SECRET: secret,
      ROAD_DATA_API_SECRET: contextSecret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Packaged API exited before readiness");
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException))
        throw error;
    }
    await delay(100);
  }
  throw new Error("Packaged API did not become ready");
});

afterAll(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise<void>((resolve) =>
      server?.once("exit", () => resolve()),
    );
    server.kill("SIGTERM");
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("a relocated production artifact starts and health discloses no configuration", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    service: "peruroad-api",
    status: "ok",
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("the public CA is packaged and local environment files are excluded", async () => {
  if (!directory) throw new Error("Missing test artifact");
  const requireFromArtifact = createRequire(
    join(directory, "apps/api/server.js"),
  );
  const packageRoot = dirname(
    dirname(
      await realpath(
        requireFromArtifact.resolve("@peruroad/road-data/database"),
      ),
    ),
  );
  expect(packageRoot.startsWith(`${await realpath(directory)}/`)).toBe(true);
  expect(
    (await stat(join(packageRoot, "certs/supabase-prod-ca-2021.crt"))).isFile(),
  ).toBe(true);
  const files = await readdir(directory, { recursive: true });
  expect(files.some((file) => /(^|\/)\.env($|\.)/.test(file))).toBe(false);
});

test("the mounted route rejects missing and wrong credentials without a database", async () => {
  for (const authorization of [undefined, "Bearer invalid"]) {
    const response = await fetch(`${baseUrl}/api/jobs/sutran`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ requestId: "offline-test" }),
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  }
});

test("authenticated malformed JSON and extra fields are rejected before persistence", async () => {
  for (const body of [
    "{",
    JSON.stringify({ requestId: "offline-test", roadCode: "PE-1" }),
  ]) {
    const response = await fetch(`${baseUrl}/api/jobs/sutran`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body,
    });
    expect(response.status).toBe(400);
  }
});

test("the mounted endpoint enforces method and body limits", async () => {
  expect((await fetch(`${baseUrl}/api/jobs/sutran`)).status).toBe(405);
  const response = await fetch(`${baseUrl}/api/jobs/sutran`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: " ".repeat(1_025),
  });
  expect(response.status).toBe(413);
});

test("production logs do not contain the job credential", () => {
  expect(output).not.toContain(secret);
  expect(output).not.toContain(contextSecret);
});

test("the context route rejects missing and job credentials, and validates read inputs", async () => {
  for (const token of [undefined, secret]) {
    const response = await fetch(`${baseUrl}/api/internal/road-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind: "official_alerts" }),
    });
    expect(response.status).toBe(401);
  }
  const invalid = await fetch(`${baseUrl}/api/internal/road-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${contextSecret}`,
    },
    body: JSON.stringify({
      kind: "place",
      name: "corcona",
      sender: "unwanted",
    }),
  });
  expect(invalid.status).toBe(400);
});
test("the packaged context route shows unavailable data during a database outage", async () => {
  const response = await fetch(`${baseUrl}/api/internal/road-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${contextSecret}`,
    },
    body: JSON.stringify({ kind: "official_alerts" }),
  });
  expect(response.status).toBe(503);
  const body: unknown = await response.json();
  expect(body).toMatchObject({
    kind: "official_alerts",
    state: "unavailable",
    absenceDoesNotConfirmClearance: true,
  });
});
