/* eslint-disable @typescript-eslint/no-explicit-any */
import dbus from "dbus-next";
import { MPRISService } from "./service";
import { app } from "electron";

export class MediaPlayer2Interface extends dbus.interface.Interface {
    service: MPRISService;

    private _canQuit: boolean;
    private _canRaise: boolean;
    private _fullscreen: boolean;
    private _canSetFullscreen: boolean;
    private _hasTrackList: boolean;
    private _identity: string;
    private _desktopEntry: string;
    private _supportedUriSchemes: string[];
    private _supportedMimeTypes: string[];

    constructor(service: MPRISService) {
        super("org.mpris.MediaPlayer2");
        this.service = service;
        this._canQuit = true;
        this._canRaise = true;
        this._fullscreen = false;
        this._canSetFullscreen = false;
        this._hasTrackList = false;
        this._identity = "Apple Music";
        this._desktopEntry = app.name;
        this._supportedUriSchemes = [];
        this._supportedMimeTypes = [];

        MediaPlayer2Interface.configureMembers({
            properties: {
                CanQuit: { signature: "b", access: "read" },
                CanRaise: { signature: "b", access: "read" },
                Fullscreen: { signature: "b", access: "readwrite" },
                CanSetFullscreen: { signature: "b", access: "read" },
                HasTrackList: { signature: "b", access: "read" },
                Identity: { signature: "s", access: "read" },
                DesktopEntry: { signature: "s", access: "read" },
                SupportedUriSchemes: { signature: "as", access: "read" },
                SupportedMimeTypes: { signature: "as", access: "read" },
            },
            methods: {
                Raise: { inSignature: "", outSignature: "" },
                Quit: { inSignature: "", outSignature: "" },
            },
        });
    }

    get CanQuit(): boolean {
        return this._canQuit;
    }

    get CanRaise(): boolean {
        return this._canRaise;
    }

    get Fullscreen(): boolean {
        return this._fullscreen;
    }
    set Fullscreen(value: boolean) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { Fullscreen: value },
            [],
        );
        this._fullscreen = value;
    }

    get CanSetFullscreen(): boolean {
        return this._canSetFullscreen;
    }

    get HasTrackList(): boolean {
        return this._hasTrackList;
    }

    get Identity(): string {
        return this._identity;
    }

    get DesktopEntry(): string {
        return this._desktopEntry;
    }

    get SupportedUriSchemes(): string[] {
        return this._supportedUriSchemes;
    }

    get SupportedMimeTypes(): string[] {
        return this._supportedMimeTypes;
    }

    Raise() {
        this.service.emit("raise");
    }
    Quit() {
        this.service.emit("quit");
    }
}

export class MediaPlayer2PlayerInterface extends dbus.interface.Interface {
    service: MPRISService;

    private _playbackStatus: string;
    private _loopStatus: string;
    private _rate: number;
    private _shuffle: boolean;
    private _metadata: any;
    private _volume: number;
    private _position: number;
    private _minimumRate: number;
    private _maximumRate: number;
    private _canGoNext: boolean;
    private _canGoPrevious: boolean;
    private _canPlay: boolean;
    private _canPause: boolean;
    private _canSeek: boolean;
    private _canControl: boolean;

    constructor(service: MPRISService) {
        super("org.mpris.MediaPlayer2.Player");
        this.service = service;

        this._playbackStatus = "Stopped";
        this._loopStatus = "None";
        this._rate = 1;
        this._shuffle = false;
        this._metadata = {};
        this._volume = 1;
        this._position = 0;
        this._minimumRate = 1;
        this._maximumRate = 1;
        this._canGoNext = true;
        this._canGoPrevious = true;
        this._canPlay = true;
        this._canPause = true;
        this._canSeek = true;
        this._canControl = true;

        MediaPlayer2PlayerInterface.configureMembers({
            properties: {
                PlaybackStatus: { signature: "s", access: "read" },
                LoopStatus: { signature: "s", access: "readwrite" },
                Rate: { signature: "d", access: "readwrite" },
                Shuffle: { signature: "b", access: "readwrite" },
                Metadata: { signature: "a{sv}", access: "read" },
                Volume: { signature: "d", access: "readwrite" },
                Position: { signature: "x", access: "read" },
                MinimumRate: { signature: "d", access: "read" },
                MaximumRate: { signature: "d", access: "read" },
                CanGoNext: { signature: "b", access: "read" },
                CanGoPrevious: { signature: "b", access: "read" },
                CanPlay: { signature: "b", access: "read" },
                CanPause: { signature: "b", access: "read" },
                CanSeek: { signature: "b", access: "read" },
                CanControl: { signature: "b", access: "read" },
            },
            methods: {
                Next: { inSignature: "", outSignature: "" },
                Previous: { inSignature: "", outSignature: "" },
                Pause: { inSignature: "", outSignature: "" },
                PlayPause: { inSignature: "", outSignature: "" },
                Stop: { inSignature: "", outSignature: "" },
                Play: { inSignature: "", outSignature: "" },
                Seek: { inSignature: "x", outSignature: "" },
                SetPosition: { inSignature: "ox", outSignature: "" },
                OpenUri: { inSignature: "s", outSignature: "" },
            },
            signals: {
                Seeked: { signature: "x" },
            },
        });
    }

    get PlaybackStatus(): string {
        return this._playbackStatus;
    }
    set PlaybackStatus(value: string) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { PlaybackStatus: value },
            [],
        );
        this._playbackStatus = value;
    }

    get LoopStatus(): string {
        return this._loopStatus;
    }
    set LoopStatus(value: string) {
        this.service.emit("loop", { state: value });
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { LoopStatus: value },
            [],
        );
        this._loopStatus = value;
    }

    get Rate(): number {
        return this._rate;
    }
    set Rate(value: number) {
        this._rate = value;
    }

    get Shuffle(): boolean {
        return this._shuffle;
    }
    set Shuffle(value: boolean) {
        this.service.emit("shuffle", { state: value });
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { Shuffle: value },
            [],
        );
        this._shuffle = value;
    }

    get Metadata(): any {
        return this._metadata;
    }
    set Metadata(value: any) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { Metadata: value },
            [],
        );
        this._metadata = value;
    }

    get Volume(): number {
        return this._volume;
    }
    set Volume(value: number) {
        this._volume = value;
    }

    get Position(): number {
        return this._position;
    }
    set Position(value: number) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { Position: value },
            [],
        );
        this._position = value;
    }

    get MinimumRate(): number {
        return this._minimumRate;
    }
    set MinimumRate(value: number) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { MinimumRate: value },
            [],
        );
        this._minimumRate = value;
    }

    get MaximumRate(): number {
        return this._maximumRate;
    }
    set MaximumRate(value: number) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { MaximumRate: value },
            [],
        );
        this._maximumRate = value;
    }

    get CanGoNext(): boolean {
        return this._canGoNext;
    }
    set CanGoNext(value: boolean) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { CanGoNext: value },
            [],
        );
        this._canGoNext = value;
    }

    get CanGoPrevious(): boolean {
        return this._canGoPrevious;
    }
    set CanGoPrevious(value: boolean) {
        MediaPlayer2PlayerInterface.emitPropertiesChanged(
            this,
            { CanGoPrevious: value },
            [],
        );
        this._canGoPrevious = value;
    }

    get CanPlay(): boolean {
        return this._canPlay;
    }
    set CanPlay(value: boolean) {
        this._canPlay = value;
    }

    get CanPause(): boolean {
        return this._canPause;
    }
    set CanPause(value: boolean) {
        this._canPause = value;
    }

    get CanSeek(): boolean {
        return this._canSeek;
    }
    set CanSeek(value: boolean) {
        this._canSeek = value;
    }

    get CanControl(): boolean {
        return this._canControl;
    }
    set CanControl(value: boolean) {
        this._canControl = value;
    }

    Next() {
        this.service.emit("next");
    }
    Previous() {
        this.service.emit("previous");
    }
    Pause() {
        this.service.emit("pause");
    }
    PlayPause() {
        this.service.emit("playpause");
    }
    Stop() {
        this.service.emit("stop");
    }
    Play() {
        this.service.emit("play");
    }
    Seek(offset: number) {
        this.service.emit("seek", offset);
    }
    SetPosition(trackId: string, position: number) {
        this.service.emit("setposition", trackId, position);
    }
    OpenUri(uri: string) {
        this.service.emit("openuri", uri);
    }
}
