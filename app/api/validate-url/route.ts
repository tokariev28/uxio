import { NextRequest, NextResponse } from "next/server";
import { isUnsafeUrl } from "@/lib/utils/ssrf";

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }

  if (!url) {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }

  // Basic format check
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".")) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }
  } catch {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }

  // SSRF guard — block private IPs, non-standard ports, non-HTTP(S) schemes
  if (isUnsafeUrl(url)) {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }

  // Reachability check — HEAD with 5s timeout, fallback to GET if 405
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    if (res.status === 405) {
      const getController = new AbortController();
      const getTimer = setTimeout(() => getController.abort(), 5000);
      try {
        res = await fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: getController.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(getTimer);
      }
    }

    // Any response (even 4xx/5xx) means the server exists
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false, reason: "unreachable" });
  } finally {
    clearTimeout(timer);
  }
}
