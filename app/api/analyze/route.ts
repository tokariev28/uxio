import { createSSEStream } from "@/lib/sse";
import { runPipeline } from "@/lib/agents/orchestrator";

export const maxDuration = 60;

export async function POST(request: Request) {
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

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".")) {
      throw new Error("Invalid hostname");
    }
  } catch {
    return Response.json(
      { error: "Please provide a valid URL (e.g. https://apollo.io)" },
      { status: 400 }
    );
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
