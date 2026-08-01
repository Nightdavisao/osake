import { Client } from "@xhayper/discord-rpc";
import { PlayerSink } from "../player";
import { TrackMetadata, PlayerIntegration } from "../@types/interfaces";
import { MKPlaybackState } from "../@types/enums";
import { secToMillis, getArtworkUrl, uploadToFreeImageHost } from "../utils";
import { Logger } from "log4js";
import log4js from "log4js";
import { AppState } from "../app/state";
import SQLiteBackedKV from "../database/kv";
import { app } from "electron";
import { xxh64 } from "@node-rs/xxhash";

const INVISIBLE = "\u00A0";

export class DiscordIntegration implements PlayerIntegration {
    shortName: string = "discord";

    logger: Logger;
    kvCache: SQLiteBackedKV<string>;
    playerSink: PlayerSink | null;
    client: Client;
    wasPaused: boolean;
    reconnectTimeout: NodeJS.Timeout | null;
    constructor(state: AppState) {
        this.kvCache = new SQLiteBackedKV<string>(app, "discordUrlCache.db");
        this.logger = log4js.getLogger("discordIntegration");
        this.logger.level = "debug";
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

        const originalArtworkUrl = getArtworkUrl(metadata);
        let artworkUrl = originalArtworkUrl;

        if (originalArtworkUrl && artworkUrl && artworkUrl.length > 256) {
            try {
                // remove the AMZ signing params to properly hash
                const strippedArtworkUrl = originalArtworkUrl.replace(
                    /\?.+/,
                    "",
                );

                const hash = xxh64(Buffer.from(strippedArtworkUrl)).toString(
                    16,
                );

                const alreadyCached = this.kvCache.get(hash);

                if (alreadyCached) {
                    this.logger.info(
                        "url is already cached",
                        originalArtworkUrl,
                        hash,
                        alreadyCached,
                    );
                    artworkUrl = alreadyCached;
                } else {
                    const artRes = await fetch(originalArtworkUrl);
                    const artBuffer = await artRes.arrayBuffer();

                    const uploadedItem = await uploadToFreeImageHost(artBuffer);

                    artworkUrl = uploadedItem.image.url;

                    this.logger.info(
                        "successfully uploaded artwork to freeimagehost",
                        originalArtworkUrl,
                        hash,
                        uploadedItem,
                    );
                    this.kvCache.set(hash, artworkUrl);
                }
            } catch (e) {
                this.logger.warn(
                    "failed to upload artwork to freeimagehost, the image will possibly be blank on discord",
                    e,
                );
            }
        }

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
            largeImageKey: artworkUrl ? artworkUrl : undefined,
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
