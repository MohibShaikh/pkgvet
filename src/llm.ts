import type { Verdict } from "./types.js";

export async function llmOpinion(
  v: Verdict,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const prompt =
    `A static scanner produced this verdict for npm package ${v.package.name}@${v.package.version}: ` +
    `level=${v.risk.level}, capabilities=${v.capabilities.join(",")}. ` +
    `In one sentence, do you agree it is risky?`;

  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? null;
}
