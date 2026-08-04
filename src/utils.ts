import fs from "node:fs/promises";
import { file } from "tmp-promise";
import { TrackMetadata } from "~/types/interfaces";
import { AppConfig } from "~/config";

export const AM_BASE_URL = "https://beta.music.apple.com";
export const AM_CLASSICAL_BASE_URL = "https://classical.music.apple.com";
export const PODCASTS_BASE_URL = "https://podcasts.apple.com";

export const PLAYBACK_STATES = {
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

export const LASTFM_CREDS = {
	apiKey: "a98bc1dd6cfc979509fed721e8ff677a",
	apiSecret: "b6ae158dccece92b4b17bbcf349a7aaa",
};

export function parseCookie(cookieString: string) {
	const cookieMap: Record<string, string> = {};
	const cookies = cookieString.split(";").map(item => item.trim());

	for (const cookie of cookies) {
		const separatorIndex = cookie.indexOf("=");
		if (separatorIndex > -1) {
			const key = cookie.substring(0, separatorIndex);
			const value = cookie.substring(separatorIndex + 1);

			cookieMap[key] = value;
		}
	}

	return cookieMap;
}

export function sanitizeName(albumName: string) {
	return albumName
		.replace(
			/\s*[([]\s*(?:deluxe edition|special edition|anniversary edition|limited edition|bonus tracks|expanded edition|remastered|live|album version)(?:\s?([0-9]+))?\s*[)\]]/gi,
			"",
		)
		.replace(/- ep$/gi, "")
		.replace(/- single$/gi, "")
		.trim();
}

export function getArtworkUrl(metadata: TrackMetadata) {
	if (metadata.artwork) {
		if (metadata.artwork.width && metadata.artwork.height) {
			const formattedUrl = metadata.artwork.url
				.replace(/\{w\}/g, metadata.artwork.width.toString())
				.replace(/\{h\}/g, metadata.artwork.height.toString())
				.replace(/\{f\}/g, "jpg"); // podcasts

			return formattedUrl;
		}
		return metadata.artwork.url;
	}
	return null;
}

const FIH_API_KEY = "6d207e02198a847aa98d0a2a901485a5";

export async function uploadToFreeImageHost(buffer: ArrayBufferLike): Promise<{
	status_code: 200;
	image: {
		url: string;
		nsfw: string;
	};
}> {
	const form = new FormData();
	form.append("key", FIH_API_KEY);
	form.append("action", "upload");
	form.append("source", Buffer.from(buffer).toString("base64"));
	form.append("format", "json");

	const response = await fetch("https://freeimage.host/api/1/upload", {
		method: "POST",
		body: form,
	});

	return response.json();
}

// return the path for the saved buffer
export async function tmpSaveFile(data: Buffer) {
	const { path } = await file();
	try {
		await fs.writeFile(path, data);
		return path;
	} catch (e) {
		console.warn("failed to save tmp file", e);
	}
	return null;
}

export const secToMicro = (seconds: number) =>
	Math.round(Number(seconds) * 1e6);
export const microToSec = (microseconds: number) => Number(microseconds) / 1e6;
export const secToMillis = (seconds: number) =>
	Math.round(Number(seconds) * 1e3);
export const millisToSec = (milliseconds: number) => Number(milliseconds) / 1e3;

class OsakeError extends Error {
	constructor(message: string, cause: Error) {
		super(message);
		this.cause = cause;
		this.name = "OsakeError";
	}
}

export async function getAppleGeolocation(
	config: AppConfig,
	url: string,
): Promise<string> {
	const storefrontId = config.get("storefrontId");

	if (!storefrontId) {
		try {
			const amResponse = await fetch(url);
			const setCookieResponse = amResponse.headers.get("Set-Cookie");
			if (setCookieResponse) {
				const cookie = parseCookie(setCookieResponse);
				const guessedGeo = cookie["geo"];

				if (guessedGeo) {
					config.set("storefrontId", guessedGeo);
					return guessedGeo;
				}
			}
		} catch (e) {
			throw new OsakeError(
				"Unable to get geo cookie from Apple Music",
				e as Error,
			);
		}
	}

	return storefrontId;
}
