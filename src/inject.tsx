/* eslint-disable @typescript-eslint/no-explicit-any */
import backIconSvg from "~/extra/svg/back.svg";
import appMenuIconSvg from "~/extra/svg/ellipsis.svg";
import forwardIconSvg from "~/extra/svg/forward.svg";
import styleFixtures from "~/extra/css/fixtures.css";
import classicalFixtures from "~/extra/css/classicalOnly.css";
import liquidFixtures from "~/extra/css/liquidOnly.css";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "jsx-dom";

const isClassical = window.location.hostname.includes("classical");

function buildNavHeader() {
	const iconButtonStyle = {
		width: "15px",
		height: "15px",
		color: "white",
	};

	return (
		<div
			style={{
				zIndex: "5",
				alignItems: "center",
				marginTop: "4px",
				padding: "18px",
				display: "flex",
				gap: "8px",
			}}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					flexGrow: "1",
				}}>
				<button
					style={iconButtonStyle}
					innerHTML={backIconSvg}
					onClick={() => history.back()}
				/>
				<button
					style={iconButtonStyle}
					innerHTML={forwardIconSvg}
					onClick={() => history.forward()}
				/>
			</div>
			<button
				style={{ width: "28px", height: "28px", color: "white" }}
				innerHTML={appMenuIconSvg}
				onClick={(event: Event) => window.AMWrapper.openAppMenu(event)}
			/>
		</div>
	);
}

function buildDraggableRegion() {
	return (
		<div
			style={{
				height: "env(titlebar-area-height, 0)" as any,
				position: "fixed",
				width: "100%",
			}}
		/>
	);
}

const observer = new MutationObserver((mutationsList: MutationRecord[]) => {
	for (const mutation of mutationsList) {
		if (mutation.type !== "attributes") continue;

		if (mutation.attributeName === "hydrated") {
			console.log("hydrated");

			const navigationHeader = document.querySelector(".navigation__header");

			if (navigationHeader) {
				console.log("adding the nav header to nav header", navigationHeader);

				navigationHeader.parentNode?.prepend(buildNavHeader());
			}
			const scrollablePage = document.querySelector("#scrollable-page");

			if (scrollablePage) {
				console.log("adding draggable app region");
				const region = buildDraggableRegion();
				region.style.setProperty("app-region", "drag");
				region.style.zIndex = "99";
				if (!isClassical) {
					scrollablePage.prepend(region);
				} else {
					document.querySelector(".app-container")?.prepend(region);
				}
			}
			observer.disconnect();
			return;
		}
	}
});

document.addEventListener("DOMContentLoaded", () => {
	const styleElement = document.createElement("style");
	if (!isClassical) {
		styleElement.innerText = styleFixtures + "\n\n" + liquidFixtures;
	} else {
		styleElement.innerText = styleFixtures + "\n\n" + classicalFixtures;
	}
	document.head.appendChild(styleElement);

	observer.observe(document.documentElement, {
		attributes: true,
	});
});

const setupEventListener = async (instance: any) => {
	console.log("starting to listen for musickit events", instance);

	const ipcRenderer = window.AMWrapper.ipcRenderer;
	const areWeClassical = window.location.hostname.includes("classical");

	const MusicKit = window.MusicKit;

	ipcRenderer.on("playpause", () => {
		if (instance.playbackState === MusicKit.PlaybackStates.playing) {
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
	ipcRenderer.on("shuffle", async (event, data) => {
		instance.shuffleMode = data.mode ? 1 : 0;
	});
	ipcRenderer.on("repeat", async (event, data) => {
		instance.repeatMode = MusicKit.PlayerRepeatMode[data["mode"]];
	});
	ipcRenderer.on("rate", (event, data) => {
		instance.playbackRate = data;
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

			if (!areWeClassical) {
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

	instance.addEventListener("playbackRateDidChange", () => {
		ipcRenderer.send("rate", instance.playbackRate);
	});
};

const handler = {
	get(target: any, prop: any) {
		const value = Reflect.get(target, prop, target);
		return typeof value === "function" ? value.bind(target) : value;
	},
	set(target: any, prop: any, value: any): any {
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

// we are doing this so that we don't need to "win a race" in the first place
// preload scripts get loaded before the website itself
let _musicKit: any;
Object.defineProperty(window, "MusicKit", {
	configurable: true,
	get() {
		return _musicKit;
	},
	set(mk) {
		console.log("called set on mk proxy");

		const musicKitObjectHandler = {
			get(target: any, prop: any) {
				if (prop === "getInstance") {
					const originalGetInstance = target.getInstance.bind(target);
					return () => wrapInstance(originalGetInstance());
				}
				const value = Reflect.get(target, prop, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
			set(target: any, prop: any, value: any) {
				return Reflect.set(target, prop, value, target);
			},
		};
		_musicKit = new Proxy(mk, musicKitObjectHandler);
	},
});

console.log("hello");
