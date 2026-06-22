import { afterEach, expect, test, vi } from "vitest";
import { llmOpinion } from "./llm.js";
import type { Verdict } from "./types.js";

const verdict: Verdict = {
  package: { name: "x", version: "1.0.0" },
  capabilities: ["net"], findings: [], risk: { score: 80, level: "high" },
};

afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

test("returns null when no API key is set", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  expect(await llmOpinion(verdict)).toBeNull();
});

test("returns the model note when a key is set", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const fakeFetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ text: "looks suspicious" }] }),
  })) as unknown as typeof fetch;
  expect(await llmOpinion(verdict, fakeFetch)).toContain("looks suspicious");
});
