import { app, BrowserWindow, dialog, ipcMain, Tray } from "electron";
import { AppConfig } from "../config";
import { fileURLToPath } from "node:url";
import os from "node:os";
import {
    AM_BASE_URL,
    AM_CLASSICAL_BASE_URL,
    getAppleGeolocation,
} from "../utils";
import { PlayerSink as PlayerSink } from "../player";
import { MPRISIntegration } from "../integration/mpris";
import { DiscordIntegration } from "../integration/discord";
import { MKPlaybackState, WebsiteType } from "../@types/enums";
import { buildTrayMenu, openAppMenu, setupTray } from "./menu";
import { DEFAULT_WINDOW_TITLE, getIconFilenames } from "./utils";
import { interceptFetchResponse } from "./intercept";
import { TrackMetadata } from "../@types/interfaces";
import log4js from "log4js";
import { Logger } from "log4js";
const { getLogger } = log4js;

const currentPlatform = os.platform();

export class AppState {
    logger: Logger = getLogger("appState");
    mainWindow: BrowserWindow | null = null;
    currentWebsite: WebsiteType = "music";
    playerSink: PlayerSink | null = null;
    config: AppConfig | null = null;
    tray: Tray | null = null;
    isQuitting: boolean = false;

    constructor() {}

    async startup() {
        this.config = new AppConfig(app, {
            currentWebsite: "music",
            enableDiscordRPC: false,
            enableMPRIS: true,
        });
        this.currentWebsite = this.config.get("currentWebsite");
        this.logger.info("current website is " + this.currentWebsite);
        const options: Electron.BrowserWindowConstructorOptions = {
            icon: getIconFilenames(this.config.get("currentWebsite")).trayPng,
            width: 800,
            height: 600,
            autoHideMenuBar: true,
            backgroundColor: "#1f1f1f",
            webPreferences: {
                preload: fileURLToPath(
                    new URL("./preload.cjs", import.meta.url),
                ),
                nodeIntegration: false,
            },
            ...(this.currentWebsite === "music"
                ? { titleBarStyle: "hidden" }
                : { titleBarStyle: "default" }),
            ...(this.currentWebsite === "music"
                ? {
                      titleBarOverlay: {
                          symbolColor: "#fff",
                          color: "#1f1f1f",
                      },
                  }
                : {}),
        };
        Object.assign(options, this.config.get("winBounds"));

        this.mainWindow = new BrowserWindow(options);
        this.playerSink = new PlayerSink(ipcMain, this.mainWindow.webContents);
        const promises = [
            this.checkIntegrations(),
            this.playerSink.initialize(),
            this.setupPlayerListeners(),
            interceptFetchResponse(this.mainWindow.webContents.debugger),
            this.setupWindowEventListeners(),
            setupTray(this),
        ];
        try {
            this.logger.info("initializing stuff...");

            await Promise.all(promises);
        } catch (e) {
            // imediate exit?
            this.logger.debug("something wrong happened on startup", e);
            dialog.showErrorBox(
                "Something wrong happened!",
                (e as Error).message,
            );

            app.exit(1);
        }

        const currentWebsiteURL =
            this.config.get("currentWebsite") === "music"
                ? AM_BASE_URL
                : AM_CLASSICAL_BASE_URL;

        const geo = await getAppleGeolocation(this.config);

        let amUrl = currentWebsiteURL;
        if (geo && typeof geo === "string") {
            amUrl = `${currentWebsiteURL}/${geo.toLowerCase()}`;
        }
        this.mainWindow.loadURL(amUrl);
    }

    private setupWindowEventListeners() {
        ipcMain.handle("openAppMenu", (event) => openAppMenu(this, event));

        this.mainWindow?.on("page-title-updated", (e) => e.preventDefault());
        this.mainWindow?.on("close", (event) => {
            if (!this.isQuitting) {
                event.preventDefault();
                this.mainWindow?.hide();
                return false;
            } else {
                if (this.mainWindow) {
                    this.config?.set("winBounds", this.mainWindow.getBounds());
                    this.mainWindow.destroy();
                }
                return true;
            }
        });

        this.mainWindow?.webContents.on(
            "before-input-event",
            (event, input) => {
                if (
                    input.alt &&
                    input.shift &&
                    input.key.toLowerCase() === "i"
                ) {
                    this.mainWindow?.webContents.openDevTools();
                    return;
                }
            },
        );

        this.mainWindow?.webContents.setWindowOpenHandler(() => {
            return { action: "deny" };
        });
    }

    private setupPlayerListeners() {
        this.playerSink?.on("nowPlaying", (metadata: TrackMetadata) => {
            if (metadata) {
                this.mainWindow?.setTitle(
                    `${metadata.name} - ${metadata.artistName} — ${DEFAULT_WINDOW_TITLE}`,
                );
            }
        });

        this.playerSink?.on("playbackState", ({ state: playbackState }) => {
            if (this.playerSink?.metadata) {
                switch (playbackState) {
                    case MKPlaybackState.Paused:
                    case MKPlaybackState.Playing:
                        this.mainWindow?.setTitle(
                            `${this.playerSink?.metadata?.name} - ${this.playerSink?.metadata?.artistName} — ${DEFAULT_WINDOW_TITLE}`,
                        );
                        break;
                    default:
                        this.mainWindow?.setTitle(DEFAULT_WINDOW_TITLE);
                        break;
                }
            } else {
                this.mainWindow?.setTitle(DEFAULT_WINDOW_TITLE);
            }
            buildTrayMenu(this);
        });

        this.playerSink?.on("shuffle", () => buildTrayMenu(this));
        this.playerSink?.on("repeat", () => buildTrayMenu(this));
    }

    checkIntegrations() {
        if (this.config?.get("enableMPRIS") && currentPlatform === "linux") {
            this.playerSink?.addIntegration(
                new MPRISIntegration(this.playerSink),
            );
        }

        if (this.config?.get("enableDiscordRPC")) {
            this.playerSink?.addIntegration(new DiscordIntegration(this));
        }
    }

    switchWebsite(type: WebsiteType) {
        if (this.currentWebsite === type) return;

        this.config?.set("currentWebsite", type);
        app.relaunch();
        app.exit(0);
    }

    toggleWindow() {
        if (this.mainWindow?.isVisible()) {
            this.mainWindow?.hide();
        } else {
            this.mainWindow?.show();
        }
        buildTrayMenu(this);
    }

    quitApp() {
        this.isQuitting = true;
        app.quit();
    }
}
