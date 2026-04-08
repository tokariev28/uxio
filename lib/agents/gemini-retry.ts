const DELAYS_503 = [1_000, 2_000, 4_000]; // fast exponential — server recovers quickly
const DELAYS_429 = [5_000, 10_000];        // rate limit — longer back-off

function detectErrorType(err: unknown): "429" | "503" | "other" {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("429") || msg.toLowerCase().includes("too many requests")) return "429";
  if (
    msg.includes("503") ||
    msg.toLowerCase().includes("service unavailable") ||
    msg.toLowerCase().includes("overloaded")
  )
    return "503";
  return "other";
}

/**
 * Wraps a Gemini generateContent call with separate retry budgets for 503
 * (server overload) and 429 (rate limit), with per-attempt jitter.
 *
 * - 503: up to 3 retries at 1 s, 2 s, 4 s base delays
 * - 429: up to 2 retries at 5 s, 10 s base delays
 * - All other errors are re-thrown immediately.
 * - Each delay = baseDelay + random jitter up to 1 s.
 *
 * @param fn       The async call to retry (should be a pure lambda over generateContent).
 * @param onRetry  Optional callback invoked before each sleep (receives delay in seconds).
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (delaySeconds: number) => void
): Promise<T> {
  let attempts503 = 0;
  let attempts429 = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const type = detectErrorType(err);

      let base: number | undefined;
      if (type === "503" && attempts503 < DELAYS_503.length) {
        base = DELAYS_503[attempts503++];
      } else if (type === "429" && attempts429 < DELAYS_429.length) {
        base = DELAYS_429[attempts429++];
      }

      if (base === undefined) throw err;

      const delay = base + Math.random() * 1_000;
      onRetry?.(Math.round(delay / 100) / 10);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}
