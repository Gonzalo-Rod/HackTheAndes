import { afterEach, expect, it, vi } from "vitest";
import { loadAtomicMemoryConfiguration } from "./env";

afterEach(() => vi.unstubAllEnvs());

function withEnv(apiUrl: string, apiKey: string) {
  vi.stubEnv("ATOMICMEMORY_API_URL", apiUrl);
  vi.stubEnv("ATOMICMEMORY_API_KEY", apiKey);
  return loadAtomicMemoryConfiguration();
}

it("is disabled when neither variable is set", () => {
  expect(withEnv("", "")).toEqual({ kind: "disabled" });
});

it("accepts HTTPS Cloud and loopback HTTP Core, keeping only the origin", () => {
  expect(withEnv("https://api.atomicstrata.ai/v1/", "test-key")).toEqual({
    kind: "enabled",
    apiUrl: "https://api.atomicstrata.ai",
    apiKey: "test-key",
  });
  expect(withEnv("http://127.0.0.1:17350", "test-key")).toMatchObject({ kind: "enabled", apiUrl: "http://127.0.0.1:17350" });
});

it.each([
  ["https://api.atomicstrata.ai", "", ["ATOMICMEMORY_API_KEY"]],
  ["", "test-key", ["ATOMICMEMORY_API_URL"]],
  ["http://memory.example.com", "test-key", ["ATOMICMEMORY_API_URL"]],
  ["https://user:pass@memory.example.com", "test-key", ["ATOMICMEMORY_API_URL"]],
  ["not a url", "test-key", ["ATOMICMEMORY_API_URL"]],
  ["https://memory.example.com/?target=other", "test-key", ["ATOMICMEMORY_API_URL"]],
  ["https://memory.example.com/#fragment", "test-key", ["ATOMICMEMORY_API_URL"]],
])("reports a half or invalid configuration (%s) by name without throwing or echoing values", (apiUrl, apiKey, variables) => {
  const result = withEnv(apiUrl, apiKey);
  expect(result).toEqual({ kind: "invalid", variables });
  expect(JSON.stringify(result)).not.toContain("test-key");
});
