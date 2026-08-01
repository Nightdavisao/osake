# Osake「お酒」

Unofficial Electron wrapper for Apple Music (and Apple Music Classical) with some quality‑of‑life desktop integrations.

> Not affiliated with or endorsed by Apple Inc. Use at your own risk.

## Features

* Linux **MPRIS** support
* Discord Rich Presence 
* ~~Last.fm scrobbling~~
* Switch between **Apple Music** and **Apple Music Classical** (Note: Classical is not 100% okay just yet)
* Tray menu with quick playback + visibility controls

## Download
Releases are published on the [Releases page](https://github.com/Nightdavisao/apple-music-wrapper/releases).

> Only Linux AppImage is provided currently.

## Build from source
```bash
git clone https://github.com/Nightdavisao/osake.git
cd osake
npm install
# If you want to test your changes
npm start
# If you want to build the app
npm run app:dist
```
Build artifacts will appear under `release/`.

## Known Issues / Limitations
* Live radio stations currently break the app.
* Only Linux builds provided right now.
* No automatic updates.