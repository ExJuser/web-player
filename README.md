# Local Web Player

Local Web Player is a browser-based local video player built with React, TypeScript, and Vite. It scans videos from a folder selected by the user, plays them directly in the browser, and stores playback progress and preferences in the project data folder.

The app is designed for personal local media libraries. It does not upload video files to a remote server.

## Features

- Select a local folder and scan playable videos.
- Drag and drop video files or folders into the player.
- Play common video formats: `.mp4`, `.webm`, `.ogg`, `.mov`, `.m4v`, `.mkv`.
- Load subtitle files: `.srt`, `.vtt`.
- Automatically match subtitles by video filename, with support for manually adding subtitles.
- Save playback progress, completed status, favorites, shortcuts, and preferences.
- Generate and cache video thumbnails in the browser.
- Sort playlists by name, path, modified time, or size.
- Filter and play favorites.
- Series mode for grouping videos by inferred series title.
- Playback modes: sequential, single loop, list loop, shuffle, and favorites only.
- Keyboard shortcut customization.
- Privacy mode for quickly hiding playback content.
- Cinema mode, fullscreen, picture-in-picture, volume control, playback speed, seeking, and video rotation.
- Optional local file deletion when the selected folder grants write permission.

## Tech Stack

- React 19
- TypeScript
- Vite
- lucide-react

## Requirements

- Node.js
- npm
- A modern browser with local file APIs.

For the best experience, use a Chromium-based browser such as Chrome or Edge. Folder selection and persistent local folder access depend on the File System Access API, which is not supported equally across all browsers.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

By default, the app runs on:

```text
http://127.0.0.1:3001
```

The port is configured in:

```text
config/app.json
```

## Available Scripts

```bash
npm run dev
```

Starts the Vite development server. The custom dev script reads the port from `config/app.json` and binds to `127.0.0.1`.

```bash
npm run build
```

Runs TypeScript checking with `tsc --noEmit`, then builds the production assets with Vite.

```bash
npm run preview
```

Serves the production build locally through Vite preview, using the configured local port.

## Usage

1. Open the app in a supported browser.
2. Choose a local folder that contains video files.
3. Allow folder access when the browser asks for permission.
4. Select a video from the playlist.
5. Optionally add matching subtitle files or manually load a subtitle.
6. Use the playlist tools to sort, filter favorites, enable series mode, or switch playback modes.

The app ignores very small local video files and common non-episode names such as `theme_video` and `trailer`.

## Local Data and Privacy

This app works with local browser APIs and local files:

- Video files are played from the folder or files selected by the user.
- Video files are not uploaded by this app.
- Playback progress, favorites, player preferences, volume, folder prompt preferences, and generated thumbnails are saved under `.local-web-player-data/` in this project folder.
- The selected media folder is not written to for playback progress, favorites, preferences, or thumbnails.
- Recent folder handles are still stored in the browser's IndexedDB because browsers do not expose a serializable file-system handle format.

The app must be opened through `npm run dev` or `npm run preview` so the local project-data API can write `.local-web-player-data/`. Opening the built HTML directly cannot persist project-folder data.

## Browser Permissions

The app requests read access to scan and play the selected folder. Write access to the media folder is only used for:

- Deleting a local video file when the user confirms deletion.
- Importing and removing the legacy `.local-web-player-progress.json` file after project-folder data has been saved.

Deletion is only attempted after user confirmation and only when the browser grants the required folder permission.

## Project Structure

```text
.
+-- config/
|   +-- app.json              # Local server configuration
+-- scripts/
|   +-- dev-server.mjs        # Vite wrapper that applies local host and port settings
+-- src/
|   +-- App.tsx               # Main player application
|   +-- main.tsx              # React entry point
|   +-- styles.css            # Application styles
|   +-- vite-assets.d.ts      # Vite asset type declarations
+-- index.html
+-- package.json
+-- package-lock.json
+-- tsconfig.json
+-- vite.config.ts
```

## Configuration

The development and preview server port is configured in `config/app.json`:

```json
{
  "server": {
    "port": 3001
  },
  "media": {
    "roots": []
  }
}
```

Change `server.port` if port `3001` is already in use.

To enable embedded subtitle extraction, install `ffmpeg` and `ffprobe` on your system path, then add the local media folders that the app is allowed to read from:

```json
{
  "server": {
    "port": 3001
  },
  "media": {
    "roots": [
      {
        "id": "anime",
        "label": "Anime",
        "path": "D:\\Media\\Anime"
      }
    ]
  }
}
```

The home view uses a global media library: every configured media root is scanned into one playlist, search index, progress store, favorites list, and tag store. Local roots and browser roots with `localPath` are scanned automatically by the local dev server. Browser roots without `localPath` stay visible in the media library card as needing access/configuration and are not auto-scanned.

When a video's media root has a server-readable path, the player can detect and extract embedded text subtitles from videos in that root. Image subtitle formats such as PGS and VobSub are detected but not OCR'd.

Browser-added media libraries keep their browser folder name in `path`. To let the local Vite server use `ffmpeg`/`ffprobe` for that same library, configure its server-readable absolute path in `localPath` or use the in-app “配置本机路径” dialog:

```json
{
  "id": "anime",
  "label": "Anime",
  "path": "Anime",
  "source": "browser",
  "localPath": "D:\\Media\\Anime"
}
```

Subtitle summaries and Q&A use DeepSeek through the local Vite API proxy. Configure the API key in your shell or `.env.local` before starting the dev server:

```text
DEEPSEEK_API_KEY=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

Bangumi matching in series mode uses the local Vite API proxy. Configure these values in your shell or `.env.local` before starting the dev server:

```text
BANGUMI_USER_AGENT=local/bangumi-lens/0.1.0 (https://github.com/local/web-player)
BANGUMI_ACCESS_TOKEN=your_bangumi_access_token
BANGUMI_LENS_PROXY=http://127.0.0.1:7897
```

Keep `BANGUMI_ACCESS_TOKEN` in local environment files only. The app exposes only Bangumi configuration status to the browser, not the token or request headers.

## Build

Create a production build:

```bash
npm run build
```

The generated files are written to `dist/`.

## Git Ignore Notes

The repository ignores local dependency folders, build output, npm cache, logs, and TypeScript build info:

```text
node_modules/
dist/
.local-web-player-data/
.npm-cache/
*.log
*.tsbuildinfo
```

Before publishing a fork or modified version, keep secrets such as API keys, tokens, and `.env` files out of Git.

## Known Notes

- Folder selection depends on browser support for `showDirectoryPicker`.
- Project-folder persistence depends on running the local Vite/Node service.
- Some media formats may depend on the browser's built-in codec support.
- Large folders may take time to scan and generate thumbnails.

## License

No license file is currently included. Add a license before publishing the project if you want others to use, modify, or redistribute it under clear terms.
