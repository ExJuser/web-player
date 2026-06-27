import assert from "node:assert/strict";
import test from "node:test";

import { callDeepSeek, chunkText, streamDeepSeek } from "../server/deepSeekClient.mjs";

function createStreamResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

test("chunkText splits text into fixed-size chunks without dropping content", () => {
  assert.deepEqual(chunkText("abcdef", 2), ["ab", "cd", "ef"]);
  assert.deepEqual(chunkText("abcde", 2), ["ab", "cd", "e"]);
});

test("callDeepSeek sends chat requests with configured model and response format", async () => {
  const calls = [];
  const result = await callDeepSeek(
    {
      DEEPSEEK_API_KEY: "secret",
      DEEPSEEK_BASE_URL: "https://api.example.test///",
      DEEPSEEK_MODEL: "custom-model",
    },
    [{ role: "user", content: "hi" }],
    {
      responseFormat: { type: "json_object" },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ choices: [{ message: { content: "  ok  " } }] }), { status: 200 });
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(calls[0].url, "https://api.example.test/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "custom-model");
  assert.equal(body.temperature, 0.3);
  assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("callDeepSeek reports missing keys and response errors", async () => {
  await assert.rejects(() => callDeepSeek({}, []), /DEEPSEEK_API_KEY is not configured/);
  await assert.rejects(
    () =>
      callDeepSeek(
        { DEEPSEEK_API_KEY: "secret" },
        [],
        {
          fetchImpl: async () => new Response("bad request", { status: 400, statusText: "Bad Request" }),
        },
      ),
    /bad request/,
  );
});

test("streamDeepSeek parses SSE deltas across chunks and ignores malformed blocks", async () => {
  const deltas = [];
  const result = await streamDeepSeek(
    { DEEPSEEK_API_KEY: "secret", DEEPSEEK_API_BASE_URL: "https://stream.example.test/" },
    [{ role: "user", content: "hi" }],
    (delta) => deltas.push(delta),
    {
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://stream.example.test/chat/completions");
        const body = JSON.parse(init.body);
        assert.equal(body.stream, true);
        assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
        return createStreamResponse([
          'data: {"choices":[{"delta":{"content":" he"}}]}\n\n',
          "data: not-json\n\n",
          'data: {"choices":[{"delta":{"content":"llo "}}]}',
          "\n\ndata: [DONE]\n\n",
        ]);
      },
    },
  );

  assert.deepEqual(deltas, [" he", "llo "]);
  assert.equal(result, "hello");
});

test("streamDeepSeek rejects responses without a readable body", async () => {
  await assert.rejects(
    () =>
      streamDeepSeek({ DEEPSEEK_API_KEY: "secret" }, [], () => undefined, {
        fetchImpl: async () => ({ ok: true, body: null }),
      }),
    /Streaming response is unavailable/,
  );
});
