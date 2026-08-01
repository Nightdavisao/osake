/* eslint-disable @typescript-eslint/no-explicit-any */

import { contextBridge, ipcRenderer } from "electron";

interface AMWrapper {
    ipcRenderer: {
        send: (channel: string, data: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
    };
    openBurgerMenu: () => void;
    // navigation is driven by sending 'nav' events with 'back' | 'forward'
    window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
    };
}

declare global {
    interface Window {
        AMWrapper: AMWrapper;
        MusicKit: any;
    }
}
contextBridge.exposeInMainWorld("AMWrapper", {
    ipcRenderer: {
        send: (channel: string, data: any) => {
            ipcRenderer.send(channel, data);
        },
        on: (channel: string, func: (...args: any[]) => void) => {
            ipcRenderer.on(channel, func);
        },
    },
    openBurgerMenu: () => {
        ipcRenderer.send("open-menu");
    },
    window: {
        minimize: () => ipcRenderer.send("window", "minimize"),
        maximize: () => ipcRenderer.send("window", "maximize"),
        close: () => ipcRenderer.send("window", "close"),
    },
} as AMWrapper);

document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === "childList") {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node instanceof Element) {
                            if (node.id === "scrollable-page") {
                                const appDraggableRegion = document.createElement("div");
                                appDraggableRegion.style.setProperty(
                                    "app-region",
                                    "drag",
                                );
                                appDraggableRegion.style.padding = "20px";
                                appDraggableRegion.style.zIndex = "99";
                                appDraggableRegion.style.position = "fixed";
                                appDraggableRegion.style.width = "100%";
                                appDraggableRegion.style.backgroundColor = "#1f1f1f";

                                const paddingElem = document.createElement('div')
                                paddingElem.style.padding = "20px"

                                node?.prepend(appDraggableRegion);
                                node?.prepend(paddingElem)
                            }
                        }
                    }
                });
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = `
        button[data-testid="exit-beta"], div[data-testid="native-cta"] {
            display: none !important;
        }
        div[slot="secondary-actions"] {
            position: fixed;
            z-index: 2;
        }
    `;
    document.head.appendChild(style);
});

contextBridge.executeInMainWorld({
    func: () => {
        const setupEventListener = async (instance: any) => {
            console.log("starting to listen for musickit events", instance);

            const ipcRenderer = window.AMWrapper.ipcRenderer;
            const areWeClassical =
                window.location.hostname.includes("classical");

            const MusicKit = window.MusicKit;

            ipcRenderer.on("playpause", () => {
                if (
                    instance.playbackState === MusicKit.PlaybackStates.playing
                ) {
                    instance.pause();
                } else {
                    instance.play();
                }
            });

            ipcRenderer.on("playbackState", async (event, data) => {
                switch (data.state) {
                    case "playing":
                        instance.play();
                        break;
                    case "paused":
                        instance.pause();
                        break;
                    case "stopped":
                        instance.stop();
                        break;
                }
            });

            ipcRenderer.on("nextTrack", async () => instance.skipToNextItem());
            ipcRenderer.on("previousTrack", async () =>
                instance.skipToPreviousItem(),
            );
            ipcRenderer.on("playbackTime", async (event, data) =>
                instance.seekToTime(data.progress),
            );
            ipcRenderer.on("shuffle", async (event, data) => {
                instance.shuffleMode = data.mode ? 1 : 0;
            });
            ipcRenderer.on("repeat", async (event, data) => {
                instance.repeatMode = MusicKit.PlayerRepeatMode[data["mode"]];
            });

            function getAlbumData(response: any) {
                const data = response["data"];
                console.log("getAlbumData", data);
                let albumData = null;

                try {
                    albumData =
                        data[0]["relationships"]["albums"]["data"][0][
                            "attributes"
                        ];
                } catch {
                    try {
                        albumData = data[0]["attributes"];
                    } catch {
                        return instance.nowPlayingItem.attributes;
                    }
                }
                return albumData;
            }

            instance.addEventListener(
                "nowPlayingItemDidChange",
                async (data: any) => {
                    console.log("nowPlayingItemDidChange", data);
                    const mediaItem = data["item"];
                    if (mediaItem && mediaItem["attributes"]) {
                        ipcRenderer.send(
                            "nowPlaying",
                            mediaItem["attributes"] || {},
                        );

                        if (!areWeClassical) {
                            // regex kanged from musickit (this checks if the playing item is in the user's library)
                            if (
                                /^[a|i|l|p]{1}\.[a-zA-Z0-9]+$/.test(
                                    mediaItem["id"],
                                )
                            ) {
                                console.log("sending album data");
                                const libraryData = await instance.api.music(
                                    `/v1/me/library/songs/${mediaItem["id"]}`,
                                    { include: "albums" },
                                );
                                const response = await libraryData["data"];
                                const albumData = getAlbumData(response);
                                console.log("albumData", albumData);
                                ipcRenderer.send(
                                    "nowPlayingAlbumData",
                                    albumData,
                                );
                            } else {
                                console.log("sending album data");
                                const catalogData = await instance.api.music(
                                    `/v1/catalog/{{storefrontId}}/songs/${mediaItem["id"]}`,
                                    { include: "albums" },
                                );
                                const response = await catalogData["data"];
                                const albumData = getAlbumData(response);
                                console.log("albumData", albumData);
                                ipcRenderer.send(
                                    "nowPlayingAlbumData",
                                    albumData,
                                );
                            }
                        } else {
                            ipcRenderer.send("nowPlayingAlbumData", null);
                        }
                    }
                },
            );

            instance.addEventListener("playbackTimeDidChange", async () => {
                if (instance["currentPlaybackTime"]) {
                    ipcRenderer.send("playbackTime", {
                        position: instance["currentPlaybackTime"],
                    });
                }
            });

            instance.addEventListener(
                "playbackStateDidChange",
                async ({ state }: { state: "string" }) => {
                    const playbackState = MusicKit.PlaybackStates[state];
                    ipcRenderer.send("playbackState", { state: playbackState });
                },
            );

            instance.addEventListener("shuffleModeDidChange", async () => {
                const mode = instance.shuffleMode === 1;
                ipcRenderer.send("shuffle", { mode });
            });

            instance.addEventListener("repeatModeDidChange", async () => {
                const mode = MusicKit.PlayerRepeatMode[instance.repeatMode];
                ipcRenderer.send("repeat", { mode });
            });
        };

        const handler = {
            get(target: any, prop: any) {
                if (prop === "bitrate") {
                    console.log(
                        "overriding bitrate to the highest possible (256)",
                    );
                    return 256;
                }
                if (prop === "previewOnly") {
                    return false;
                }

                const value = Reflect.get(target, prop, target);
                return typeof value === "function" ? value.bind(target) : value;
            },
            set(target: any, prop: any, value: any): any {
                if (prop === "bitrate") {
                    console.log(
                        "overriding bitrate to the highest possible (256)",
                    );
                    return 256;
                }
                if (prop === "previewOnly") {
                    return false;
                }
                
                return Reflect.set(target, prop, value, target);
            },
        };

        const proxyCache = new WeakMap();
        function wrapInstance(real: any) {
            if (!real) return real;
            if (proxyCache.has(real)) return proxyCache.get(real);

            const proxy = new Proxy(real, handler);
            proxyCache.set(real, proxy);
            setupEventListener(proxy).catch(console.error);
            return proxy;
        }

        let _musicKit: any;
        Object.defineProperty(window, "MusicKit", {
            configurable: true,
            get() {
                return _musicKit;
            },
            set(mk) {
                console.log("called set, proxy");
                const musicKitObjectHandler = {
                    get(target: any, prop: any) {
                        if (prop === "getInstance") {
                            const originalGetInstance =
                                target.getInstance.bind(target);
                            return () => wrapInstance(originalGetInstance());
                        }
                        const value = Reflect.get(target, prop, target);
                        return typeof value === "function"
                            ? value.bind(target)
                            : value;
                    },
                    set(target: any, prop: any, value: any) {
                        return Reflect.set(target, prop, value, target);
                    },
                };
                _musicKit = new Proxy(mk, musicKitObjectHandler);
            },
        });
    },
});
