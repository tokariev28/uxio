import { generateText, gateway, Output } from "ai";
import type { z } from "zod";

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

// ── Retry helper ───────────────────────────────────────────────────────────────
// Retries only on transient failures (rate limit, service unavailable, timeout).
// Max 2 retries with 1 s → 2 s delays (total worst-case overhead: 3 s).
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("rate") ||
    msg.includes("timeout") ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("econnrefused") ||
    msg.includes("connection reset")
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries || !isTransientError(err)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  // unreachable, but satisfies TypeScript
  throw new Error("withRetry: exhausted");
}

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
  const { text } = await withRetry(() =>
    generateText({
      model: gateway(chain.primary),
      system: params.system,
      prompt: params.prompt,
      maxRetries: 0,
      timeout: 90_000,
      providerOptions: {
        gateway: { models: chain.fallbacks },
        ...(params.json && { google: { generationConfig: { responseMimeType: 'application/json' } } }),
      },
    })
  );
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

  const { text } = await withRetry(() =>
    generateText({
      model: gateway(chain.primary),
      system: params.system,
      messages: [{ role: "user", content }],
      maxRetries: 0,
      timeout: 90_000,
      providerOptions: {
        gateway: { models: chain.fallbacks },
        ...(params.json && { google: { generationConfig: { responseMimeType: 'application/json' } } }),
      },
    })
  );
  return text;
}

// ── Structured output with Zod schema (type-safe, auto-validated) ─────────
// Replaces manual JSON.parse → extractJSON → jsonrepair → field validation.
// The AI SDK passes the schema to the provider (Gemini responseSchema / OpenAI
// response_format) and validates the output automatically.
export async function aiGenerateStructured<T>(
  chain: Chain,
  params: { system: string; prompt: string; schema: z.ZodType<T> }
): Promise<T> {
  const { output } = await withRetry(() =>
    generateText({
      model: gateway(chain.primary),
      output: Output.object({ schema: params.schema }),
      system: params.system,
      prompt: params.prompt,
      maxRetries: 0,
      timeout: 90_000,
      providerOptions: {
        gateway: { models: chain.fallbacks },
      },
    })
  );
  if (!output) throw new Error("AI returned no structured output");
  return output;
}
