/* eslint-disable @typescript-eslint/no-explicit-any */
import { isClassical } from "./utils";

const ipcRenderer = window.AMWrapper.ipcRenderer;

const PLAYBACK_STATES = {
	"0": "none",
	"1": "loading",
	"2": "playing",
	"3": "paused",
	"4": "stopped",
	"5": "ended",
	"6": "seeking",
	"8": "waiting",
	"9": "stalled",
	"10": "completed",
	"none": 0,
	"loading": 1,
	"playing": 2,
	"paused": 3,
	"stopped": 4,
	"ended": 5,
	"seeking": 6,
	"waiting": 8,
	"stalled": 9,
	"completed": 10,
};

const REPEAT_MODE = {
	"0": "none",
	"1": "one",
	"2": "all",
	"none": 0,
	"one": 1,
	"all": 2,
};

export const setupEventListener = async (instance: any) => {
	console.log("starting to listen for musickit events", instance);

	ipcRenderer.on("playpause", () => {
		if (instance.playbackState === PLAYBACK_STATES.playing) {
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
	ipcRenderer.on("previousTrack", async () => instance.skipToPreviousItem());
	ipcRenderer.on("playbackTime", async (event, data) =>
		instance.seekToTime(data.progress),
	);
	ipcRenderer.on("shuffle", async (event, { mode }) => {
		instance.shuffleMode = mode ? 1 : 0;
	});
	ipcRenderer.on("repeat", async (event, { mode }) => {
		// @ts-expect-error idk
		instance.repeatMode = REPEAT_MODE[mode];
	});
	ipcRenderer.on("rate", (event, data) => {
		instance.playbackRate = data;
	});
	ipcRenderer.on("volume", (event, data) => {
		instance.volume = data;
	});

	function getAlbumData(response: any) {
		const data = response["data"];
		console.log("getAlbumData", data);
		let albumData = null;

		try {
			albumData = data[0]["relationships"]["albums"]["data"][0]["attributes"];
		} catch {
			try {
				albumData = data[0]["attributes"];
			} catch {
				return instance.nowPlayingItem.attributes;
			}
		}
		return albumData;
	}

	instance.addEventListener("nowPlayingItemDidChange", async (data: any) => {
		console.log("nowPlayingItemDidChange", data);
		const mediaItem = data["item"];
		if (mediaItem && mediaItem["attributes"]) {
			ipcRenderer.send("nowPlaying", mediaItem["attributes"] || {});

			if (!isClassical()) {
				// regex kanged from musickit (this checks if the playing item is in the user's library)
				if (/^[a|i|l|p]{1}\.[a-zA-Z0-9]+$/.test(mediaItem["id"])) {
					console.log("sending album data");
					const libraryData = await instance.api.music(
						`/v1/me/library/songs/${mediaItem["id"]}`,
						{ include: "albums" },
					);
					const response = await libraryData["data"];
					const albumData = getAlbumData(response);
					console.log("albumData", albumData);
					ipcRenderer.send("nowPlayingAlbumData", albumData);
				} else {
					console.log("sending album data");
					const catalogData = await instance.api.music(
						`/v1/catalog/{{storefrontId}}/songs/${mediaItem["id"]}`,
						{ include: "albums" },
					);
					const response = await catalogData["data"];
					const albumData = getAlbumData(response);
					console.log("albumData", albumData);
					ipcRenderer.send("nowPlayingAlbumData", albumData);
				}
			} else {
				ipcRenderer.send("nowPlayingAlbumData", null);
			}
		}
	});

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
			// @ts-expect-error idk
			const playbackState = PLAYBACK_STATES[state];
			ipcRenderer.send("playbackState", { state: playbackState });
		},
	);

	instance.addEventListener("shuffleModeDidChange", async () => {
		const mode = instance.shuffleMode === 1;
		ipcRenderer.send("shuffle", { mode });
	});

	instance.addEventListener("repeatModeDidChange", async () => {
		// @ts-expect-error idk
		const mode = REPEAT_MODE[instance.repeatMode];
		ipcRenderer.send("repeat", { mode });
	});

	instance.addEventListener("playbackRateDidChange", () => {
		ipcRenderer.send("rate", instance.playbackRate);
	});

	instance.addEventListener("playbackVolumeDidChange", () => {
		ipcRenderer.send("volume", instance.volume);
	});
};
