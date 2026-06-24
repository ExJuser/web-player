# Local Web Player

Local Web Player is a browser-based local video player built with React, TypeScript, and Vite. It scans videos from a folder selected by the user, plays them directly in the browser, and stores playback progress and preferences locally.

The app is designed for personal local media libraries. It does not upload video files to a server.

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
- Playback progress and favorites are saved to `.local-web-player-progress.json` inside the selected folder when write permission is available.
- Recent folder handles and generated thumbnails are stored in the browser's IndexedDB.
- Volume and folder prompt preferences are stored in browser storage.

If you clear browser site data, cached folder handles, thumbnails, and browser-only preferences may be removed.

## Browser Permissions

The app may request read/write access to the selected folder. Write access is used for:

- Saving playback progress and favorites.
- Saving player preferences.
- Deleting a local video file when the user confirms deletion.

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
  }
}
```

Change `server.port` if port `3001` is already in use.

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
.npm-cache/
*.log
*.tsbuildinfo
```

Before publishing a fork or modified version, keep secrets such as API keys, tokens, and `.env` files out of Git.

## Known Notes

- Folder selection depends on browser support for `showDirectoryPicker`.
- Local progress saving depends on write permission for the selected folder.
- Some media formats may depend on the browser's built-in codec support.
- Large folders may take time to scan and generate thumbnails.

## License

No license file is currently included. Add a license before publishing the project if you want others to use, modify, or redistribute it under clear terms.
