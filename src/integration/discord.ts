import { Client } from "@xhayper/discord-rpc";
import { PlayerSink } from "../player";
import { TrackMetadata, PlayerIntegration } from "../@types/interfaces";
import { MKPlaybackState } from "../@types/enums";
import { secToMillis, getArtworkUrl } from "../utils";
import { Logger } from "log4js";
import log4js from "log4js";
import { AppState } from "../app/state";

const INVISIBLE = "\u00A0";

export class DiscordIntegration implements PlayerIntegration {
    shortName: string = "discord";

    logger: Logger;
    playerSink: PlayerSink | null;
    client: Client;
    wasPaused: boolean;
    reconnectTimeout: NodeJS.Timeout | null;
    constructor(state: AppState) {
        this.logger = log4js.getLogger("discordIntegration");
        this.playerSink = state.playerSink;
        this.client = new Client({
            clientId:
                state.currentWebsite === "music"
                    ? "1350945271827136522"
                    : "1406427068320841788",
        });
        this.wasPaused = false;
        this.reconnectTimeout = null;
    }

    async load() {
        this.client.on("ready", () => {
            this.logger.info("discord RPC ready");
        });

        this.playerSink?.on(
            "nowPlaying",
            async (metadata: TrackMetadata) => await this.setActivity(metadata),
        );
        this.playerSink?.on("playbackState", async ({ state }) => {
            switch (state) {
                case MKPlaybackState.Playing:
                    if (this.playerSink?.metadata)
                        await this.setActivity(this.playerSink.metadata);
                    break;
                case MKPlaybackState.Stopped:
                case MKPlaybackState.Paused:
                default:
                    this.wasPaused = true;
                    await this.client.user?.clearActivity();
                    break;
            }
        });
        this.playerSink?.on("playbackTime", async () => {
            if (this.playerSink?.metadata && this.wasPaused) {
                await this.setActivity(this.playerSink.metadata);
                this.wasPaused = false;
            }
        });
        this.client.on("disconnected", () => {
            this.logger.info("disconnected from Discord RPC");
            this.createReconnectInterval();
        });
        await this.connect();
    }

    async connect() {
        try {
            await this.client.login();
        } catch {
            this.createReconnectInterval();
        }
    }

    createReconnectInterval(interval: number = 3000) {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(async () => {
            if (!this.client.isConnected) {
                await this.connect();
            }
        }, interval);
    }

    async setActivity(metadata: TrackMetadata) {
        if (!this.client.isConnected) return;

        this.logger.info("setting Discord activity");

        const artwork = getArtworkUrl(metadata);
        const artworkUrl = artwork && artwork.length <= 256 ? artwork : "";
        await this.client.user?.setActivity({
            type: 2, // LISTENING
            details: metadata["name"].padEnd(2, INVISIBLE),
            ...(typeof metadata["url"] === "string"
                ? {
                      detailsUrl: metadata["url"],
                      largeImageUrl: metadata["url"].split("?")[0],
                  }
                : {}),
            state: metadata["artistName"].padEnd(2, INVISIBLE),
            largeImageKey: artworkUrl,
            largeImageText: metadata["albumName"].padEnd(2, INVISIBLE),
            startTimestamp: this.playerSink?.playbackTime
                ? Date.now() - secToMillis(this.playerSink.playbackTime)
                : undefined,
            endTimestamp: this.playerSink?.playbackTime
                ? Date.now() +
                  (metadata.durationInMillis -
                      secToMillis(this.playerSink.playbackTime))
                : undefined,
            instance: false,
            statusDisplayType: 1, // ACTIVITY_STATE
        });
    }

    unload() {
        if (this.client.isConnected) {
            this.client.removeAllListeners();
            this.client.destroy();
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        }
    }
}
