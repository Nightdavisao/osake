import { app, BrowserWindow, dialog, ipcMain, Tray } from "electron";
import log4js, { Logger } from "log4js";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { MKPlaybackState, WebsiteService } from "~/@types/enums";
import { TrackMetadata } from "~/@types/interfaces";
import { AppConfig } from "~/config";
import { DiscordIntegration } from "~/integration/discord";
import { MPRISIntegration } from "~/integration/mpris";
import { PlayerSink } from "~/player";
import {
	AM_BASE_URL,
	AM_CLASSICAL_BASE_URL,
	getAppleGeolocation,
	PODCASTS_BASE_URL,
} from "~/utils";
import { interceptFetchResponse } from "./intercept";
import { buildTrayMenu, openAppMenu, setupTray } from "./menu";
import {
	DEFAULT_WINDOW_TITLE,
	getIconFilenames,
	isLiquidGlassDesign,
} from "./utils";
import {
	AppLocale,
	AppLocaleFactory,
	DumbLocaleTFallback,
	LocaleItem,
} from "~/lib/i18n";
import { isKnownStorefront, storefrontMapping } from "~/lib/i18n/mapping";

const currentPlatform = os.platform();

export class AppState {
	logger: Logger = log4js.getLogger("appState");
	localeFactory: AppLocaleFactory;
	locale: AppLocale = new DumbLocaleTFallback();
	mainWindow: BrowserWindow | null = null;
	currentWebsite: WebsiteService = "music";
	playerSink: PlayerSink | null = null;
	config: AppConfig;
	tray: Tray | null = null;
	isQuitting: boolean = false;

	constructor() {
		this.logger.level = "debug";
		this.config = new AppConfig(app, {
			currentWebsite: "music",
			enableDiscordRPC: false,
			enableMPRIS: true,
		});

		const appLanguage = this.config.get("appLanguage");
		const savedStorefrontId = this.config.get("storefrontId");

		if (appLanguage) {
			this.logger.info(`appLanguage: ${appLanguage}`);
			this.localeFactory = new AppLocaleFactory(appLanguage);
		} else {
			if (isKnownStorefront(savedStorefrontId)) {
				const localePreference = storefrontMapping[savedStorefrontId]
					.preferredLanguage as LocaleItem;
				this.logger.info("preferred locale is " + localePreference);

				this.localeFactory = new AppLocaleFactory(localePreference);
			} else {
				this.localeFactory = new AppLocaleFactory();
			}
		}
	}

	async startup() {
		this.locale = await this.localeFactory.getT();

		this.currentWebsite = this.config.get("currentWebsite");
		this.logger.info("current website is " + this.currentWebsite);
		const options: Electron.BrowserWindowConstructorOptions = {
			icon: getIconFilenames(this.config.get("currentWebsite")).trayPng,
			width: 800,
			height: 600,
			autoHideMenuBar: true,
			backgroundColor: "#1f1f1f",
			webPreferences: {
				preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
				nodeIntegration: false,
			},
			...(isLiquidGlassDesign(this.currentWebsite) ?
				{
					titleBarStyle: "hidden",
					titleBarOverlay: {
						symbolColor: "#fff",
						color: "#1f1f1f",
					},
				}
			:	{ titleBarStyle: "default" }),
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
			dialog.showErrorBox("Something wrong happened!", (e as Error).message);

			app.exit(1);
		}

		let currentWebsiteURL = AM_BASE_URL;
		switch (this.config.get("currentWebsite") as WebsiteService) {
			case "classical":
				currentWebsiteURL = AM_CLASSICAL_BASE_URL;
				break;
			case "podcasts":
				currentWebsiteURL = PODCASTS_BASE_URL;
				break;
			default:
				currentWebsiteURL = AM_BASE_URL;
				break;
		}

		const geo = await getAppleGeolocation(this.config, currentWebsiteURL);

		let amUrl = currentWebsiteURL;
		if (geo && typeof geo === "string") {
			amUrl = `${currentWebsiteURL}/${geo.toLowerCase()}`;
		}
		this.mainWindow.loadURL(amUrl);
	}

	private setupWindowEventListeners() {
		ipcMain.handle("openAppMenu", event => openAppMenu(this, event));

		this.mainWindow?.on("page-title-updated", e => e.preventDefault());
		this.mainWindow?.on("close", event => {
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

		this.mainWindow?.webContents.on("before-input-event", (event, input) => {
			if (input.alt && input.shift && input.key.toLowerCase() === "i") {
				this.mainWindow?.webContents.openDevTools();
				return;
			}
		});

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
			this.playerSink?.addIntegration(new MPRISIntegration(this.playerSink));
		}

		if (this.config?.get("enableDiscordRPC")) {
			this.playerSink?.addIntegration(new DiscordIntegration(this));
		}
	}

	switchWebsite(type: WebsiteService) {
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
