import {
  createPlaylistSearchDocuments,
  parsePlaylistSearchQuery,
  searchPlaylistVideos,
  type PlaylistSearchDocument,
  type PlaylistSearchRecord,
} from "./playerPlaylistSearch";

function createTrigrams(value: string) {
  const characters = Array.from(value);
  if (characters.length < 3) return [];
  const trigrams: string[] = [];
  for (let index = 0; index <= characters.length - 3; index += 1) {
    trigrams.push(characters.slice(index, index + 3).join(""));
  }
  return trigrams;
}

export class LibrarySearchIndex {
  private activeVideoIds: Set<string> | null = null;
  private documents = new Map<string, PlaylistSearchDocument>();
  private orderedVideoIds: string[] = [];
  private recordById = new Map<string, PlaylistSearchRecord>();
  private trigramsByVideoId = new Map<string, Set<string>>();
  private videoIdsByTrigram = new Map<string, Set<string>>();

  initialize(records: PlaylistSearchRecord[]) {
    this.activeVideoIds = null;
    this.documents = createPlaylistSearchDocuments(records);
    this.orderedVideoIds = records.map((record) => record.id);
    this.recordById = new Map(records.map((record) => [record.id, record]));
    this.trigramsByVideoId.clear();
    this.videoIdsByTrigram.clear();
    records.forEach((record) => this.indexVideo(record.id));
  }

  patch(upserts: PlaylistSearchRecord[], removeIds: string[]) {
    const removeIdSet = new Set(removeIds);
    removeIds.forEach((videoId) => this.removeVideo(videoId));
    upserts.forEach((record) => {
      const exists = this.recordById.has(record.id);
      const wasActive = this.activeVideoIds?.has(record.id) ?? false;
      if (exists) this.removeVideo(record.id, false);
      this.recordById.set(record.id, record);
      this.documents.set(record.id, createPlaylistSearchDocuments([record]).get(record.id)!);
      if (!exists) this.orderedVideoIds.push(record.id);
      if (wasActive) this.activeVideoIds?.add(record.id);
      this.indexVideo(record.id);
    });
    if (removeIdSet.size) {
      this.orderedVideoIds = this.orderedVideoIds.filter((videoId) => !removeIdSet.has(videoId));
    }
  }

  setScope(videoIds: string[]) {
    this.activeVideoIds = new Set(videoIds);
  }

  search(query: string) {
    const tokens = parsePlaylistSearchQuery(query);
    let candidates: Set<string> | null = null;

    tokens.forEach((token) => {
      const trigrams = createTrigrams(token.normalized);
      if (!trigrams.length) return;
      let tokenCandidates: Set<string> | null = null;
      trigrams.forEach((trigram) => {
        const posting = this.videoIdsByTrigram.get(trigram) ?? new Set<string>();
        tokenCandidates = tokenCandidates === null
          ? new Set(posting)
          : new Set(Array.from(tokenCandidates).filter((videoId) => posting.has(videoId)));
      });
      candidates = candidates === null
        ? tokenCandidates
        : new Set(Array.from(candidates).filter((videoId) => tokenCandidates?.has(videoId)));
    });

    const videos = this.orderedVideoIds
      .filter((videoId) => (!this.activeVideoIds || this.activeVideoIds.has(videoId))
        && (!candidates || candidates.has(videoId)))
      .map((id) => ({ id }));
    return searchPlaylistVideos(videos, this.documents, query);
  }

  get size() {
    return this.recordById.size;
  }

  private indexVideo(videoId: string) {
    const document = this.documents.get(videoId);
    if (!document) return;
    const trigrams = new Set(document.entries.flatMap((entry) => createTrigrams(entry.normalizedValue)));
    this.trigramsByVideoId.set(videoId, trigrams);
    trigrams.forEach((trigram) => {
      const posting = this.videoIdsByTrigram.get(trigram) ?? new Set<string>();
      posting.add(videoId);
      this.videoIdsByTrigram.set(trigram, posting);
    });
  }

  private removeVideo(videoId: string, removeOrder = true) {
    this.trigramsByVideoId.get(videoId)?.forEach((trigram) => {
      const posting = this.videoIdsByTrigram.get(trigram);
      posting?.delete(videoId);
      if (!posting?.size) this.videoIdsByTrigram.delete(trigram);
    });
    this.trigramsByVideoId.delete(videoId);
    this.recordById.delete(videoId);
    this.documents.delete(videoId);
    this.activeVideoIds?.delete(videoId);
    if (removeOrder) this.orderedVideoIds = this.orderedVideoIds.filter((id) => id !== videoId);
  }
}
