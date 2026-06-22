import { expect, test, vi } from "vitest";

vi.mock("./resolver.js", () => ({
  ResolveError: class extends Error {},
  resolve: vi.fn(async () => ({
    name: "is0dd", version: "1.0.0",
    publishedAt: new Date().toISOString(), deprecated: false, tarball: "x",
  })),
}));

vi.mock("./fetcher.js", () => ({
  FetchError: class extends Error {},
  fetchPackage: vi.fn(async () => ({
    dir: "/tmp/does-not-matter",
    manifest: { name: "is0dd", scripts: { postinstall: "node x.js" } },
    sizeBytes: 4096,
  })),
}));

vi.mock("./signals/capabilities.js", () => ({
  capabilitiesSignal: () => [
    { id: "cap:net", weight: 8, reason: "net", capability: "net" },
    { id: "cap:env", weight: 10, reason: "env", capability: "env" },
  ],
}));

const { analyze } = await import("./analyze.js");

test("assembles a high-risk verdict for a typosquat exfil package", async () => {
  const v = await analyze("is0dd@1.0.0");
  expect(v.package.name).toBe("is0dd");
  expect(v.risk.level).toBe("high");
  expect(v.capabilities).toContain("net");
  expect(v.capabilities).toContain("env");
  expect(v.capabilities).not.toContain("obfuscated");
});
