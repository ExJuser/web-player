declare module "webtorrent" {
  export type WebTorrentFile = {
    name: string;
    path: string;
    length: number;
    type?: string;
    streamURL: string;
    streamTo(element: HTMLMediaElement): HTMLMediaElement;
  };

  export type WebTorrentTorrent = {
    infoHash: string;
    name: string;
    files: WebTorrentFile[];
    progress: number;
    downloadSpeed: number;
    numPeers: number;
    ready: boolean;
    on(event: "done" | "download" | "wire" | "noPeers", listener: () => void): WebTorrentTorrent;
    on(event: "error", listener: (error: Error) => void): WebTorrentTorrent;
    destroy(callback?: (error?: Error) => void): void;
  };

  export type WebTorrentClient = {
    torrents: WebTorrentTorrent[];
    add(
      torrentId: string,
      options: Record<string, unknown>,
      onTorrent: (torrent: WebTorrentTorrent) => void,
    ): WebTorrentTorrent;
    createServer(options: { controller: ServiceWorkerRegistration }): unknown;
    destroy(callback?: (error?: Error) => void): void;
  };
}
