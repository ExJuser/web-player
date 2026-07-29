/// <reference lib="webworker" />

import { LibrarySearchIndex } from "./librarySearchIndex";
import type { LibraryWorkerRequest, LibraryWorkerResponse } from "./libraryWorkerTypes";

const index = new LibrarySearchIndex();
let revision = 0;

function post(response: LibraryWorkerResponse) {
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<LibraryWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "initialize") {
      const startedAt = performance.now();
      revision = request.revision;
      index.initialize(request.records);
      post({
        type: "ready",
        revision,
        recordCount: index.size,
        buildMs: performance.now() - startedAt,
      });
      return;
    }
    if (request.type === "patch") {
      revision = request.revision;
      index.patch(request.upserts, request.removeIds);
      post({ type: "ready", revision, recordCount: index.size, buildMs: 0 });
      return;
    }
    if (request.type === "setScope") {
      revision = request.revision;
      index.setScope(request.videoIds);
      post({ type: "ready", revision, recordCount: index.size, buildMs: 0 });
      return;
    }

    const startedAt = performance.now();
    const result = index.search(request.query);
    post({
      type: "searchResult",
      requestId: request.requestId,
      revision,
      query: request.query,
      videoIds: result.videos.map((video) => video.id),
      matches: Array.from(result.matchesByVideoId.entries()),
      tokens: result.tokens,
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    post({
      type: "error",
      requestId: request.type === "search" ? request.requestId : undefined,
      revision,
      message: error instanceof Error ? error.message : "媒体库搜索失败。",
    });
  }
});
