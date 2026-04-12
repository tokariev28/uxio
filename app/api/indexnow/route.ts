import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site-url";

const INDEXNOW_KEY = "d4f3e2c1b0a9f8e7d6c5b4a3f2e1d0c9";

export async function GET() {
  const host = new URL(SITE_URL).hostname;
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: [SITE_URL],
    }),
  });

  return NextResponse.json({ submitted: res.ok, status: res.status });
}
