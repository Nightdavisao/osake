import { IpcMain, IpcMainEvent } from "electron";
import { getLogger, Logger } from "log4js";
import { EventEmitter } from "node:events";
import { MKPlaybackState, MKRepeatMode } from "~/@types/enums";
import { PlayerIntegration, TrackMetadata } from "~/@types/interfaces";

export class PlayerSink extends EventEmitter {
    ipcMain: IpcMain;
    webContents: Electron.WebContents;
    logger: Logger;
    metadata: TrackMetadata | null;
    playbackState: MKPlaybackState;
    playbackTime: number;
    shuffleMode: boolean;
    repeatMode: MKRepeatMode;
    playerEvents: string[];
    integrations: Map<string, PlayerIntegration>;
    
    constructor(ipcMain: IpcMain, webContents: Electron.WebContents) {
        super();
        this.logger = getLogger("playerSink");
        this.ipcMain = ipcMain;
        this.webContents = webContents;
        this.playerEvents = [
            "nowPlaying",
            "nowPlayingAlbumData",
            "playbackState",
            "playbackTime",
            "shuffle",
            "repeat",
        ];

        this.metadata = null;
        this.playbackState = MKPlaybackState.Stopped;
        this.playbackTime = 0;
        this.repeatMode = MKRepeatMode.None;
        this.shuffleMode = false;

        this.integrations = new Map();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatchIpcMessage(channel: string, data: any = null) {
        this.webContents.send(channel, data);
    }

    playPause() {
        this.dispatchIpcMessage("playpause");
    }

    play() {
        this.dispatchIpcMessage("playbackState", { state: "playing" });
    }

    pause() {
        this.dispatchIpcMessage("playbackState", { state: "paused" });
    }

    stop() {
        this.dispatchIpcMessage("playbackState", { state: "stopped" });
    }

    next() {
        this.dispatchIpcMessage("nextTrack");
    }

    previous() {
        this.dispatchIpcMessage("previousTrack");
    }

    setShuffle(mode: boolean) {
        if (typeof mode !== "boolean" || this.shuffleMode === mode) return;

        this.logger.debug("setShuffle", mode);
        this.dispatchIpcMessage("shuffle", { mode });
    }

    setRepeat(mode: MKRepeatMode) {
        if (typeof mode !== "string" || this.repeatMode === mode) return;

        this.logger.debug("setRepeat", mode);
        this.dispatchIpcMessage("repeat", { mode });
    }

    seek(time: number) {
        this.dispatchIpcMessage("playbackTime", { progress: time });
    }

    initialize() {
        this.playerEvents.forEach((event) => {
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
            (data: { state: MKPlaybackState }) =>
                (this.playbackState = data.state),
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

        const integrationsToLoad = Promise.all(this.integrations.values());

        integrationsToLoad
            .then(() => {
                this.logger.info("all integrations loaded");
                return;
            })
            .catch((error) => {
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
}
