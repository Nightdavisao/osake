# Osake

Unofficial Electron wrapper for Apple Music (and Apple Music Classical) with some quality‑of‑life desktop integrations.

> Not affiliated with or endorsed by Apple Inc. Use at your own risk.

## Features

* Linux **MPRIS** support
* Discord Rich Presence 
* ~~Last.fm scrobbling~~
* ~~Switch between **Apple Music** and **Apple Music Classical**~~
* Tray menu with quick playback + visibility controls

## Download
Binary releases are published on the [Releases page](https://github.com/Nightdavisao/apple-music-wrapper/releases).

> Only Linux AppImage is provided currently.

## Build from source

Prerequisites: Node.js 18+ (or recent LTS), npm.

```bash
git clone https://github.com/Nightdavisao/apple-music-wrapper.git
cd apple-music-wrapper
npm install
npm start
npm run app:dist
```

Artifacts will appear under `dist/` plus the packaged output directory created by `electron-builder`.

## Known Issues / Limitations

* Live radio stations currently break the app.
* Only Linux builds provided right now.
* No automatic updates.