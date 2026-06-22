import type { Verdict } from "./types.js";

type Provider = "anthropic" | "openai" | "groq" | "gemini";

function detectProvider(): { provider: Provider; key: string } | null {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY };
  if (process.env.GROQ_API_KEY) return { provider: "groq", key: process.env.GROQ_API_KEY };
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", key: process.env.GEMINI_API_KEY };
  return null;
}

function buildPrompt(v: Verdict): string {
  return (
    `A static scanner produced this verdict for npm package ${v.package.name}@${v.package.version}: ` +
    `level=${v.risk.level}, capabilities=${v.capabilities.join(",")}. ` +
    `In one sentence, do you agree it is risky?`
  );
}

const TIMEOUT_MS = 15_000;

async function callAnthropic(key: string, prompt: string, fetchImpl: typeof fetch): Promise<string | null> {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? null;
}

async function callOpenAICompatible(apiBase: string, key: string, model: string, prompt: string, fetchImpl: typeof fetch): Promise<string | null> {
  const res = await fetchImpl(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? null;
}

async function callGemini(key: string, prompt: string, fetchImpl: typeof fetch): Promise<string | null> {
  const res = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function llmOpinion(
  v: Verdict,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const detected = detectProvider();
  if (!detected) return null;

  const prompt = buildPrompt(v);
  let text: string | null = null;

  switch (detected.provider) {
    case "anthropic":
      text = await callAnthropic(detected.key, prompt, fetchImpl);
      break;
    case "openai":
      text = await callOpenAICompatible("https://api.openai.com/v1", detected.key, "gpt-5.5", prompt, fetchImpl);
      break;
    case "groq":
      text = await callOpenAICompatible("https://api.groq.com/openai/v1", detected.key, "llama-3.3-70b-versatile", prompt, fetchImpl);
      break;
    case "gemini":
      text = await callGemini(detected.key, prompt, fetchImpl);
      break;
  }

  return text ? `${detected.provider}: ${text}` : null;
}
