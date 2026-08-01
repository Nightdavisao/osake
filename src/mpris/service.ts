import dbus from "dbus-next";
import { EventEmitter } from "events";
import {
    MediaPlayer2PlayerInterface,
    MediaPlayer2Interface,
} from "./interface";
import { LoopStatus, PlaybackStatus } from "./enums";
import { Logger } from "log4js";
import log4js from "log4js";
import { app } from "electron";

export class MPRISService extends EventEmitter {
    logger: Logger;
    initialized: boolean;
    bus: dbus.MessageBus | null;
    interface: MediaPlayer2Interface | null;
    playerInterface: MediaPlayer2PlayerInterface | null;
    constructor() {
        super();
        this.logger = log4js.getLogger("mpris");
        this.logger.level = "debug";

        this.initialized = false;
        this.bus = null;
        this.interface = null;
        this.playerInterface = null;
        this.load()
    }

    async load() {
        if (!this.bus) this.bus = dbus.sessionBus();
        if (!this.interface) this.interface = new MediaPlayer2Interface(this);
        if (!this.playerInterface) this.playerInterface = new MediaPlayer2PlayerInterface(this);

        if (this.initialized) throw new Error("mpris is already up")
        
        this.bus.export("/org/mpris/MediaPlayer2", this.interface);
        this.bus.export("/org/mpris/MediaPlayer2", this.playerInterface);
        
        const returnCode = await this.bus.requestName(
            `org.mpris.MediaPlayer2.${app.name}`,
            dbus.NameFlag.DO_NOT_QUEUE,
        );
        this.logger.debug("return code:", returnCode);
        if (returnCode != dbus.RequestNameReply.PRIMARY_OWNER) {
            this.bus?.disconnect()
            throw new Error('Failed to acquire D-Bus name')
        }
        this.initialized = true;
    }

    unload() {
        this.logger.debug("disconnecting from dbus");
        this.initialized = false;
        this.bus?.disconnect();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private guessMetadataSignature(key: string, value: any): string | null {
        switch (true) {
            case key === "mpris:trackid":
                return "o";
            case key === "mpris:length":
                return "x";
            case typeof value === "string":
                return "s";
            case typeof value === "boolean":
                return "b";
            case typeof value === "number":
                return "d";
            case Array.isArray(value) &&
                value.every((v) => typeof v === "string"):
                return "as";
            default:
                return null;
        }
    }

    setMetadata(metadata: object) {
        if (this.initialized && this.playerInterface) {
            try {
                const newMetadata: Record<string, dbus.Variant> = {};

                for (const [key, value] of Object.entries(metadata)) {
                    const signature = this.guessMetadataSignature(key, value);
                    if (signature) {
                        newMetadata[key] = new dbus.Variant(signature, value);
                    }
                }
                this.logger.info("setting metadata:", newMetadata);
                this.playerInterface.Metadata = newMetadata;
            } catch (error) {
                this.logger.error("error setting metadata:", error);
            }
        }
    }

    setPlaybackStatus(status: PlaybackStatus) {
        this.logger.debug("setting playback status:", status);
        if (this.initialized && this.playerInterface)
            this.playerInterface.PlaybackStatus = status;
    }

    setPosition(position: number) {
        if (this.initialized && this.playerInterface)
            this.playerInterface.Position = position;
    }

    setLoopStatus(status: LoopStatus) {
        this.logger.debug("setting loop status:", status);
        if (this.initialized && this.playerInterface)
            this.playerInterface.LoopStatus = status;
    }

    setShuffle(shuffle: boolean) {
        this.logger.debug("setting shuffle:", shuffle);
        if (this.initialized && this.playerInterface)
            this.playerInterface.Shuffle = shuffle;
    }
}
