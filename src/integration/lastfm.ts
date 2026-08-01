import { PlayerIntegration } from "../@types/interfaces";
import { MKPlaybackState, WebsiteType } from "../@types/enums";
import {
    LastFmApiErrorCode,
    LastFMClient,
    LastFmClientError,
} from "../lastfm/client";
import { LastFMScrubbler } from "../lastfm/scrubbler";
import { PlayerSink } from "../player";
import { millisToSec, sanitizeName } from "../utils";
import { Logger } from "log4js";
import log4js from "log4js";

export class LastFMIntegration implements PlayerIntegration {
    shortName: string = "lastfm";

    logger: Logger;
    player: PlayerSink;
    scrubbler: LastFMScrubbler | null;
    currentTrack: {
        albumArtist: string;
        artistTrack: string;
        albumName: string;
        trackName: string;
        trackNumber: number;
        duration: number;
    } | null;
    client: LastFMClient;
    isInitialized: boolean;
    scrobbleAllowed: boolean;
    wasScrobbled: boolean;
    wasIgnored: boolean;
    didFail: boolean;
    threadLocked: boolean;
    lastPlayingStatusTimestamp: Date | null;
    activeWebsite: WebsiteType;
    isClassical: boolean;
    constructor(
        player: PlayerSink,
        activeWebsite: WebsiteType,
        client: LastFMClient,
    ) {
        this.logger = log4js.getLogger("lastfmIntegration");
        this.logger.level = "debug";
        this.activeWebsite = activeWebsite;
        this.isClassical = activeWebsite === 'classical';
        this.player = player;
        this.currentTrack = null;
        this.client = client;
        this.scrubbler = null;
        this.isInitialized = false;
        this.scrobbleAllowed = true;
        this.wasScrobbled = false;
        this.wasIgnored = false;
        this.didFail = false;
        this.threadLocked = false;

        this.lastPlayingStatusTimestamp = null;
    }

    setSession(userToken: string) {
        this.scrubbler = new LastFMScrubbler(this.client, userToken);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleError(e: any) {
        if (e instanceof LastFmClientError) {
            const error = e.error;

            if (error == LastFmApiErrorCode.INVALID_SESSION_KEY) {
                this.logger.info(
                    "session is invalid, gotta ask the user to log in again...",
                );
                this.player.emit("lfm:invalidsession");
            }
        }
        this.logger.error(e); // shrug
    }

    assertScrubblerState() {
        if (!this.scrobbleAllowed && !this.scrubbler) {
            throw new Error(
                "Scrobbling is not allowed (either scrobbleAllowed is false or the scrubbler hasn't been instantiated yet...)",
            );
        }
    }

    async load() {
        if (this.isInitialized) return;
        this.scrobbleAllowed = true;

        this.player.on(
            "nowPlayingAlbumData",
            async (
                albumData: {
                    artistName: string | null;
                } | null,
            ) => {
                this.assertScrubblerState();

                try {
                    const currentMetadata = this.player.metadata;
                    this.wasScrobbled = false;
                    this.wasIgnored = false;
                    this.didFail = false;
                    this.lastPlayingStatusTimestamp = null;
                    this.threadLocked = false;

                    if (currentMetadata) {
                        this.currentTrack = {
                            albumArtist: !this.isClassical
                                ? (albumData?.artistName ??
                                  currentMetadata.artistName)
                                : currentMetadata.composerName,
                            artistTrack: !this.isClassical
                                ? currentMetadata.artistName
                                : currentMetadata.composerName,
                            albumName: currentMetadata.albumName,
                            trackName: currentMetadata.name,
                            trackNumber: currentMetadata.trackNumber,
                            duration: millisToSec(
                                currentMetadata.durationInMillis,
                            ),
                        };

                        await this.scrubbler?.updateNowPlaying(
                            this.currentTrack.artistTrack,
                            sanitizeName(this.currentTrack.trackName),
                            sanitizeName(this.currentTrack.albumName),
                            this.currentTrack.albumArtist,
                            this.currentTrack.trackNumber,
                            this.currentTrack.duration,
                        );
                        this.logger.info("updating now playing");
                    } else {
                        this.logger.warn("no current metadata available");
                    }
                } catch (e) {
                    this.handleError(e);
                }
            },
        );

        this.player.on("playbackState", ({ state }) => {
            this.threadLocked = false;

            switch (state) {
                case MKPlaybackState.Stopped:
                    this.currentTrack = null;
                    break;
            }
        });

        this.player.on("playbackTime", async ({ position }) => {
            this.assertScrubblerState();

            const metadata = this.player.metadata;
            if (metadata && !this.wasIgnored) {
                if (millisToSec(metadata.durationInMillis) <= 30) {
                    this.logger.info("less than 30 seconds, ignoring track...");
                    this.wasIgnored = true;
                    return;
                }

                const durationSecs = millisToSec(metadata.durationInMillis);
                const maxDuration = 4 * 60;
                const howMuchToPlay =
                    durationSecs > maxDuration ? maxDuration : durationSecs / 2;
                //console.log(`last.fm: howMuchToPlay: ${howMuchToPlay}`)

                if (
                    !this.wasScrobbled &&
                    !this.didFail &&
                    position > howMuchToPlay
                ) {
                    if (!this.threadLocked) {
                        this.threadLocked = true;
                        this.logger.debug("acquiring lock");
                    } else {
                        return;
                    }

                    try {
                        if (this.currentTrack) {
                            this.logger.info(
                                "scrobbling current track",
                                this.currentTrack,
                            );

                            const currentTimestamp = new Date();
                            const scrobblePromise = async (currentTrack: {
                                albumArtist: string;
                                artistTrack: string;
                                albumName: string;
                                trackName: string;
                                trackNumber: number;
                                duration: number;
                            }) => {
                                const response = await this.scrubbler?.scrobble(
                                    currentTrack.artistTrack,
                                    sanitizeName(currentTrack.trackName),
                                    currentTimestamp.getTime(),
                                    sanitizeName(currentTrack.albumName),
                                    currentTrack.albumArtist,
                                    currentTrack.trackNumber,
                                    currentTrack.duration,
                                );

                                this.logger.debug(
                                    "scrobbling response",
                                    response,
                                );

                                if (
                                    response &&
                                    response["scrobbles"]["@attr"][
                                        "ignored"
                                    ] === 1
                                ) {
                                    this.wasIgnored = true;
                                }
                                this.wasScrobbled = true;

                                this.logger.debug(
                                    "scrobbling response",
                                    response,
                                );

                                this.player.emit("lfm:scrobble");
                            };
                            const timeout = new Promise((_resolve, reject) =>
                                setTimeout(
                                    () =>
                                        reject(new Error("Scrobble timed out")),
                                    10_000,
                                ),
                            );

                            await Promise.race([
                                scrobblePromise(this.currentTrack),
                                timeout,
                            ]);
                        } else {
                            throw new Error("current track is null/undefined");
                        }
                    } catch (e) {
                        console.error("last.fm: failed to scrobble", e);
                        this.handleError(e);
                        this.didFail = true;
                    } finally {
                        this.threadLocked = false;
                    }
                }
            }
        });

        this.isInitialized = true;
    }
    unload(): Promise<void> | void {
        this.scrobbleAllowed = false; // doesn't actually "unload" per se, i need to rethink about these modular integrations.
        // this.scrubbler = null
    }
}
