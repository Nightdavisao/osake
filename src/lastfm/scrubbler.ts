import { LastFMClient } from "./client";

export class LastFMScrubbler {
	client: LastFMClient;
	userToken: string;
	constructor(client: LastFMClient, userToken: string) {
		this.client = client;
		this.userToken = userToken;
	}

	async updateNowPlaying(
		artist: string,
		track: string,
		album: string | null = null,
		albumArtist: string | null = null,
		trackNumber: number | null = null,
		duration: number | null = null,
	) {
		return this.request("track.updateNowPlaying", {
			artist,
			track,
			...(album ? { album } : {}),
			...(albumArtist ? { albumArtist } : {}),
			...(trackNumber ? { trackNumber: trackNumber.toString() } : {}),
			...(duration ? { duration: duration.toString() } : {}),
		});
	}

	async scrobble(
		artist: string,
		track: string,
		timestamp: number,
		album: string | null = null,
		albumArtist: string | null = null,
		trackNumber: number | null = null,
		duration: number | null = null,
	) {
		return this.request("track.scrobble", {
			artist,
			track,
			timestamp: Math.floor(timestamp / 1000).toString(),
			...(album ? { album } : {}),
			...(albumArtist ? { albumArtist } : {}),
			...(trackNumber ? { trackNumber: trackNumber.toString() } : {}),
			...(duration ? { duration: duration.toString() } : {}),
		});
	}

	async request(method: string, data: Record<string, string>) {
		return this.client.request(method, {
			...data,
			sk: this.userToken,
		});
	}
}
