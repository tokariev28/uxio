import type { SSEEvent } from "@/lib/types/analysis";

/**
 * Creates a ReadableStream that the orchestrator can push SSE events into.
 * Returns the stream (for the Response) and a writer object with helpers.
 */
export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const writer = {
    _closed: false,
    send(event: SSEEvent) {
      if (this._closed) return;
      try {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      } catch {
        this._closed = true;
      }
    },
    close() {
      if (this._closed) return;
      this._closed = true;
      try { controller.close(); } catch { /* already closed */ }
    },
  };

  return { stream, writer };
}

export type SSEWriter = ReturnType<typeof createSSEStream>["writer"];
