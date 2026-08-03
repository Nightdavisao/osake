export enum MKPlaybackState {
	Playing = "playing",
	Paused = "paused",
	Stopped = "stopped",
}

export enum MKRepeatMode {
	None = "none",
	One = "one",
	All = "all",
}

export type WebsiteService = "music" | "classical" | "podcasts";

export type MPRISServiceOptions = {
	identity: string;
	desktopEntry: string;
	busNameSuffix: string;
	player: {
		minimumRate: number;
		maximumRate: number;
	};
};
