export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

export type SubtitleContextChunk = {
  start: string;
  end: string;
  text: string;
};

export function normalizeSubtitleText(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function stripVttStyleBlocks(raw: string) {
  return raw.replace(/(?:^|\n)STYLE(?:[^\n]*)\n[\s\S]*?(?=\n{2,}(?:NOTE|STYLE|REGION|\d{0,6}\n?[^\n]*-->|$))/gi, "\n").trim();
}

function escapeVttText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function srtTimestampToVtt(value: string) {
  return value.replace(",", ".");
}

export function srtToVtt(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  const cues = blocks
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (!lines.length) return "";
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex < 0) return "";
      const timeLine = lines[timeLineIndex].replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        (_, time: string, millis: string) => srtTimestampToVtt(`${time},${millis}`),
      );
      const textLines = lines.slice(timeLineIndex + 1).map(escapeVttText);
      return [timeLine, ...textLines].join("\n");
    })
    .filter(Boolean);

  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

export function parseSubtitleTimestamp(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2) return 0;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  return (Number.isFinite(hours) ? hours : 0) * 3600 + (Number.isFinite(minutes) ? minutes : 0) * 60 + (Number.isFinite(seconds) ? seconds : 0);
}

export function stripSubtitleMarkup(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSubtitleCues(rawText: string): SubtitleCue[] {
  const normalized = normalizeSubtitleText(rawText).replace(/^WEBVTT[^\n]*\n+/i, "");
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex < 0) return null;
      const [startValue, endValue] = lines[timeLineIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const text = stripSubtitleMarkup(lines.slice(timeLineIndex + 1).join(" "));
      if (!text) return null;
      return {
        start: parseSubtitleTimestamp(startValue),
        end: parseSubtitleTimestamp(endValue),
        text,
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function formatSubtitleTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function createSubtitleContextChunks(cues: SubtitleCue[]) {
  const chunks: SubtitleContextChunk[] = [];
  let pending: SubtitleCue[] = [];
  let pendingStart = 0;

  cues.forEach((cue) => {
    if (!pending.length) {
      pending = [cue];
      pendingStart = cue.start;
      return;
    }
    const nextText = [...pending.map((item) => item.text), cue.text].join(" ");
    if (cue.end - pendingStart > 90 || nextText.length > 1200) {
      const last = pending[pending.length - 1];
      chunks.push({
        start: formatSubtitleTime(pending[0].start),
        end: formatSubtitleTime(last.end),
        text: pending.map((item) => item.text).join(" "),
      });
      pending = [cue];
      pendingStart = cue.start;
      return;
    }
    pending.push(cue);
  });

  if (pending.length) {
    const last = pending[pending.length - 1];
    chunks.push({
      start: formatSubtitleTime(pending[0].start),
      end: formatSubtitleTime(last.end),
      text: pending.map((item) => item.text).join(" "),
    });
  }
  return chunks;
}

export function createViewedSubtitleText(cues: SubtitleCue[], currentTime: number) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return "";
  return cues
    .filter((cue) => cue.start <= currentTime)
    .map((cue) => `[${formatSubtitleTime(cue.start)} - ${formatSubtitleTime(cue.end)}] ${cue.text}`)
    .join("\n");
}

function tokenizeQuestion(question: string) {
  const words = question.toLowerCase().match(/[a-z0-9_\u4e00-\u9fa5]{2,}/g) ?? [];
  return words.length ? words : [question.toLowerCase()].filter(Boolean);
}

export function selectRelevantSubtitleChunks(question: string, cues: SubtitleCue[], currentTime: number) {
  const chunks = createSubtitleContextChunks(cues);
  const tokens = tokenizeQuestion(question);
  const scored = chunks.map((chunk, index) => {
    const haystack = chunk.text.toLowerCase();
    const keywordScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
    const start = parseSubtitleTimestamp(chunk.start);
    const currentTimeScore = currentTime > 0 ? Math.max(0, 1 - Math.abs(start - currentTime) / 1800) : 0;
    return { chunk, index, score: keywordScore + currentTimeScore };
  });
  const matches = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.chunk);
  return matches.length ? matches : chunks.slice(0, 8);
}
