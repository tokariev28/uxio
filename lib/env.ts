import { z } from "zod";

const envSchema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1, "FIRECRAWL_API_KEY is required"),
  TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
});

let _validated: z.infer<typeof envSchema> | null = null;

/** Lazily validates and returns required env vars. Throws on first call if any are missing. */
export function env() {
  if (!_validated) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.issues.map((i) => i.message).join(", ");
      throw new Error(`Missing environment variables: ${missing}`);
    }
    _validated = result.data;
  }
  return _validated;
}
