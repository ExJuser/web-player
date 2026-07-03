import { readLocalApiStream } from "./localApiClient";
import type { AiStreamEvent } from "./appTypes";

type AiTextStreamHandlers = {
  onMessage: (text: string) => void;
  onResult: (text: string) => void;
  onDelta: (text: string) => void;
};

export async function readAiTextStream(url: string, body: unknown, handlers: AiTextStreamHandlers) {
  await readLocalApiStream<AiStreamEvent>(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (event) => {
      if (event.type === "message") {
        handlers.onMessage(event.text);
        return;
      }
      if (event.type === "result") {
        handlers.onResult(event.text);
        return;
      }
      if (event.type === "delta") {
        handlers.onMessage("");
        handlers.onDelta(event.text);
      }
    },
  );
}
