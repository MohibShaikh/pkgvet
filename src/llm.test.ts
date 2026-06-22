import { afterEach, expect, test, vi } from "vitest";
import { llmOpinion } from "./llm.js";
import type { Verdict } from "./types.js";

const verdict: Verdict = {
  package: { name: "x", version: "1.0.0" },
  capabilities: ["net"], findings: [], risk: { score: 80, level: "high" },
};

const envKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"];

afterEach(() => {
  for (const k of envKeys) delete process.env[k];
});

test("returns null when no API key is set", async () => {
  expect(await llmOpinion(verdict)).toBeNull();
});

test("anthropic", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: "looks suspicious" }] }),
  });
  const result = await llmOpinion(verdict, fetchFn as unknown as typeof fetch);
  expect(result).toBe("anthropic: looks suspicious");
  const body = JSON.parse(((fetchFn.mock.calls[0] as Array<unknown>)[1] as Record<string, string>).body);
  expect(body.model).toContain("opus");
});

test("openai", async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: "fine" } }] }),
  });
  const result = await llmOpinion(verdict, fetchFn as unknown as typeof fetch);
  expect(result).toBe("openai: fine");
  expect((fetchFn.mock.calls[0] as Array<unknown>)[0]).toContain("openai.com");
});

test("groq", async () => {
  process.env.GROQ_API_KEY = "gsk-test";
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: "agree" } }] }),
  });
  const result = await llmOpinion(verdict, fetchFn as unknown as typeof fetch);
  expect(result).toBe("groq: agree");
  expect((fetchFn.mock.calls[0] as Array<unknown>)[0]).toContain("groq.com");
});

test("gemini", async () => {
  process.env.GEMINI_API_KEY = "ai-test";
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "safe" }] } }] }),
  });
  const result = await llmOpinion(verdict, fetchFn as unknown as typeof fetch);
  expect(result).toBe("gemini: safe");
  expect((fetchFn.mock.calls[0] as Array<unknown>)[0]).toContain("googleapis.com");
});

test("api failure returns null", async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const fetchFn = vi.fn();
  fetchFn.mockResolvedValue({ ok: false });
  expect(await llmOpinion(verdict, fetchFn as unknown as typeof fetch)).toBeNull();
});
