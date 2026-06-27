export function chunkText(text, size = 12000) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function resolveDeepSeekBaseUrl(env) {
  return (env.DEEPSEEK_BASE_URL || env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
}

export async function callDeepSeek(env, messages, options = {}) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
  const baseUrl = resolveDeepSeekBaseUrl(env);
  const fetchImpl = options.fetchImpl || fetch;
  const responseFormat = options && typeof options.responseFormat === "object" ? options.responseFormat : null;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.3,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || response.statusText);
  }
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

export async function streamDeepSeek(env, messages, onDelta, options = {}) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
  const baseUrl = resolveDeepSeekBaseUrl(env);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.3,
      stream: true,
      messages,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || response.statusText);
  }
  if (!response.body) throw new Error("Streaming response is unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  const handleBlock = (block) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content || "";
        if (delta) {
          output += delta;
          onDelta(delta);
        }
      } catch {
        // Ignore malformed SSE keepalive chunks.
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleBlock);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleBlock(buffer);
  return output.trim();
}
