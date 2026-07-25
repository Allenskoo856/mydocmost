import { getBackendUrl } from "@/lib/config";
import { AiStreamEvent } from "../types";

export interface AskParams {
  question: string;
  spaceId?: string;
  pageId?: string;
}

/**
 * Stream an answer from POST /api/ai/ask (SSE over fetch). Uses cookie auth
 * (credentials: include). Returns an abort function.
 */
export function askAi(
  params: AskParams,
  onEvent: (event: AiStreamEvent) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onEvent({ type: "error", message: `HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const data = dataLine.slice(5).trim();
          if (!data) continue;
          try {
            onEvent(JSON.parse(data) as AiStreamEvent);
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        onEvent({ type: "error", message: err?.message ?? "request failed" });
      }
    }
  })();

  return () => controller.abort();
}
