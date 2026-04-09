import { generateText, gateway } from "ai";

// ── Provider registry ──────────────────────────────────────────────────────────
// To add a new model: add one line here, then reference it in CHAINS below.
// Format: 'provider/model' — routed automatically through Vercel AI Gateway.
const MODELS = {
  geminiFlash:     "google/gemini-2.5-flash",
  geminiFlashLite: "google/gemini-2.5-flash-lite",
  gpt54nano:       "openai/gpt-5.4-nano",
  // claudeHaiku:  "anthropic/claude-haiku-4.5",  // ← uncomment + add to chain
  // grok:         "xai/grok-3-mini",
} as const;

// ── Fallback chains ────────────────────────────────────────────────────────────
// First entry = primary, rest = fallbacks tried in order on 503/429/timeout.
// To extend: add a model slug to the fallbacks array — no agent files change.
export const CHAINS = {
  flash:     { primary: MODELS.geminiFlash,     fallbacks: [MODELS.gpt54nano] as string[] },
  flashLite: { primary: MODELS.geminiFlashLite, fallbacks: [MODELS.gpt54nano] as string[] },
} as const;

type Chain = (typeof CHAINS)[keyof typeof CHAINS];

// ── Text generation with automatic gateway fallback ────────────────────────────
export async function aiGenerate(
  chain: Chain,
  params: { system: string; prompt: string; json?: boolean }
): Promise<string> {
  const { text } = await generateText({
    model: gateway(chain.primary),
    system: params.system,
    prompt: params.prompt,
    providerOptions: {
      gateway: { models: chain.fallbacks },
      ...(params.json && { google: { generationConfig: { responseMimeType: 'application/json' } } }),
    },
  });
  return text;
}

// ── Multimodal generation (agent5 — text + optional screenshot) ────────────────
export async function aiGenerateMultimodal(
  chain: Chain,
  params: { system: string; textContent: string; imageBase64?: string | null; json?: boolean }
): Promise<string> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Buffer; mimeType: "image/png" }
  > = [{ type: "text", text: params.textContent }];

  if (params.imageBase64) {
    content.push({
      type: "image",
      image: Buffer.from(params.imageBase64, "base64"),
      mimeType: "image/png",
    });
  }

  const { text } = await generateText({
    model: gateway(chain.primary),
    system: params.system,
    messages: [{ role: "user", content }],
    providerOptions: {
      gateway: { models: chain.fallbacks },
      ...(params.json && { google: { generationConfig: { responseMimeType: 'application/json' } } }),
    },
  });
  return text;
}
