import { IpcMain, IpcMainEvent } from "electron";
import log4js, { Logger } from "log4js";
import { EventEmitter } from "node:events";
import { MKPlaybackState, MKRepeatMode } from "~/types/enums";
import { PlayerIntegration, TrackMetadata } from "~/types/interfaces";

export class PlayerSink extends EventEmitter {
	ipcMain: IpcMain;
	webContents: Electron.WebContents;
	logger: Logger;
	metadata: TrackMetadata | null;
	private _playbackRate: number;
	private _volume: number;
	playbackState: MKPlaybackState;
	playbackTime: number;
	shuffleMode: boolean;
	repeatMode: MKRepeatMode;
	playerEvents: string[];
	integrations: Map<string, PlayerIntegration>;

	constructor(ipcMain: IpcMain, webContents: Electron.WebContents) {
		super();
		this.logger = log4js.getLogger("playerSink");
		this.ipcMain = ipcMain;
		this.webContents = webContents;
		this.playerEvents = [
			"nowPlaying",
			"nowPlayingAlbumData",
			"playbackState",
			"playbackTime",
			"shuffle",
			"repeat",
			"rate",
			"volume",
		];

		this.metadata = null;
		this.playbackState = MKPlaybackState.Stopped;
		this.playbackTime = 0;
		this._playbackRate = 1;
		this.repeatMode = MKRepeatMode.None;
		this.shuffleMode = false;
		this._volume = 1;

		this.integrations = new Map();
	}

	get playbackRate() {
		return this._playbackRate;
	}

	set playbackRate(value) {
		this.dispatch("rate", value);
		this._playbackRate = value;
	}

	get volume() {
		return this._volume;
	}

	set volume(value) {
		this.dispatch("volume", value);
		this._volume = value;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	dispatch(channel: string, data: any = null) {
		this.webContents.send(channel, data);
	}

	playPause() {
		this.dispatch("playpause");
	}

	play() {
		this.dispatch("playbackState", { state: "playing" });
	}

	pause() {
		this.dispatch("playbackState", { state: "paused" });
	}

	stop() {
		this.dispatch("playbackState", { state: "stopped" });
	}

	next() {
		this.dispatch("nextTrack");
	}

	previous() {
		this.dispatch("previousTrack");
	}

	setShuffle(mode: boolean) {
		if (typeof mode !== "boolean" || this.shuffleMode === mode) return;

		this.logger.debug("setShuffle", mode);
		this.dispatch("shuffle", { mode });
	}

	setRepeat(mode: MKRepeatMode) {
		if (typeof mode !== "string" || this.repeatMode === mode) return;

		this.logger.debug("setRepeat", mode);
		this.dispatch("repeat", { mode });
	}

	seek(time: number) {
		this.dispatch("playbackTime", { progress: time });
	}

	initialize() {
		this.playerEvents.forEach(event => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.ipcMain.on(event, (_: IpcMainEvent, data: any) => {
				this.emit(event, data);
			});
		});

		this.on("nowPlaying", (data: TrackMetadata) => {
			this.metadata = data;
			this.playbackTime = 0;
		});
		this.on(
			"playbackState",
			(data: { state: MKPlaybackState }) => (this.playbackState = data.state),
		);
		this.on(
			"playbackTime",
			(data: { position: number }) => (this.playbackTime = data.position),
		);
		this.on(
			"shuffle",
			(data: { mode: boolean }) => (this.shuffleMode = data.mode),
		);
		this.on(
			"repeat",
			(data: { mode: MKRepeatMode }) => (this.repeatMode = data.mode),
		);
		this.on("volume", volume => (this._volume = volume));
		this.on("rate", rate => (this._playbackRate = rate));

		const integrationsToLoad = Promise.all(this.integrations.values());

		integrationsToLoad
			.then(() => {
				this.logger.info("all integrations loaded");
				return;
			})
			.catch(error => {
				this.logger.error("error loading integrations", error);
			});
	}

	addIntegration(integration: PlayerIntegration) {
		if (!this.hasIntegration(integration.shortName)) {
			this.logger.debug(`adding integration ${integration.shortName}`);
			this.integrations.set(integration.shortName, integration);
			integration.load();

			return;
		}
		throw new Error(
			"This integration is already added to the integrations map.",
		);
	}

	hasIntegration(shortName: string) {
		return this.integrations.has(shortName);
	}

	getIntegration<T>(shortName: string): T {
		return this.integrations.get(shortName) as T;
	}

	async enableIntegration(shortName: string) {
		const integration = this.integrations.get(shortName);
		this.logger.debug(`enabling integration ${shortName}`);
		await integration?.load();
	}

	async disableIntegration(shortName: string) {
		const integration = this.integrations.get(shortName);
		this.logger.debug(`disabling integration ${shortName}`);
		await integration?.unload();
	}

	async toggleIntegration(shortName: string) {
		const integration = this.integrations.get(shortName);
		this.logger.debug(
			`toggling integration ${shortName}`,
			integration?.isLoaded,
		);
		if (integration) {
			return integration.isLoaded ?
					this.disableIntegration(shortName)
				:	this.enableIntegration(shortName);
		}
	}
}
