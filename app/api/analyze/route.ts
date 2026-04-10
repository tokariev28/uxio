import { createSSEStream } from "@/lib/sse";
import { runPipeline } from "@/lib/agents/orchestrator";
import { headers } from "next/headers";

export const maxDuration = 300;

// ── Rate limiter (in-memory, per IP) ──────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 2;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

// ── SSRF protection ───────────────────────────────────────────────────────
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i;

function isUnsafeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Please provide a valid URL (e.g. https://apollo.io)";
  }

  if (parsed.protocol !== "https:") {
    return "Only HTTPS URLs are allowed";
  }
  if (!parsed.hostname.includes(".")) {
    return "Please provide a valid URL (e.g. https://apollo.io)";
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    return "Private or internal URLs are not allowed";
  }
  if (parsed.port && parsed.port !== "443") {
    return "Non-standard ports are not allowed";
  }
  return null;
}

export async function POST(request: Request) {
  // ── Rate limiting ────────────────────────────────────────────────────
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Too many requests. Please wait a minute before trying again." },
      { status: 429 }
    );
  }

  // ── Origin validation ────────────────────────────────────────────────
  const origin = request.headers.get("origin");
  const host = headersList.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return Response.json(
          { error: "Cross-origin requests are not allowed" },
          { status: 403 }
        );
      }
    } catch {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: { url?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();

  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  // ── URL validation (SSRF protection) ─────────────────────────────────
  const urlError = isUnsafeUrl(url);
  if (urlError) {
    return Response.json({ error: urlError }, { status: 400 });
  }

  const { stream, writer } = createSSEStream();

  // Run the pipeline in the background — the stream stays open until it completes
  runPipeline(url, writer);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
