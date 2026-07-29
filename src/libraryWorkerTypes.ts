import type {
  PlaylistSearchMatch,
  PlaylistSearchRecord,
  PlaylistSearchToken,
} from "./playerPlaylistSearch";

export type LibraryWorkerRequest =
  | {
      type: "initialize";
      revision: number;
      records: PlaylistSearchRecord[];
    }
  | {
      type: "patch";
      revision: number;
      upserts: PlaylistSearchRecord[];
      removeIds: string[];
    }
  | {
      type: "setScope";
      revision: number;
      videoIds: string[];
    }
  | {
      type: "search";
      requestId: number;
      revision: number;
      query: string;
    };

export type LibraryWorkerResponse =
  | {
      type: "ready";
      revision: number;
      recordCount: number;
      buildMs: number;
    }
  | {
      type: "searchResult";
      requestId: number;
      revision: number;
      query: string;
      videoIds: string[];
      matches: Array<[string, PlaylistSearchMatch]>;
      tokens: PlaylistSearchToken[];
      elapsedMs: number;
    }
  | {
      type: "error";
      requestId?: number;
      revision: number;
      message: string;
    };
