import {
    app,
    BrowserWindow,
    components,
    Menu,
    ipcMain,
    MenuItem,
    Tray,
    MenuItemConstructorOptions,
} from "electron";
import path from "path";
import { Player } from "./player";
import { MPRISIntegration } from "./integration/mpris";
import { MKPlaybackState, MKRepeatMode, WebsiteType } from "./@types/enums";
import { DiscordIntegration } from "./integration/discord";
import { AppConfig } from "./config";
import {
    AM_BASE_URL,
    AM_CLASSICAL_BASE_URL,
    getAppleGeolocation,
} from "./utils";
import { TrackMetadata } from "./@types/interfaces";
import log4js from "log4js";
import os from "node:os";
import { testPatches } from "./patcher";
import { fileURLToPath } from "node:url";

const logger = log4js.getLogger("main");
logger.level = "debug";
let mainWindow: Electron.BrowserWindow;
const currentPlatform = os.platform();
logger.debug("current operating system:", currentPlatform);

// https://wiki.cachyos.org/configuration/enabling_hardware_acceleration_in_google_chrome/
const CMD_LINE_FLAGS = [
    "ignore-gpu-blocklist",
    "ignore-gpu-rasterization",
    "enable-zero-copy",
    [
        "enable-feature",
        "UseOzonePlatform,WaylandWindowDecorations,VaapiVideoDecoder,AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL,AcceleratedVideoEncoder,UseMultiPlaneFormatForHardwareVideo,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan",
    ],
    ["disable-features", "MediaSessionService"],
];

if (currentPlatform === "linux") {
    for (const flagArgument of CMD_LINE_FLAGS) {
        switch (typeof flagArgument) {
            case "string":
                app.commandLine.appendArgument(flagArgument);
                logger.debug("adding argument", flagArgument);
                break;
            default:
                if (Array.isArray(flagArgument))
                    app.commandLine.appendSwitch(
                        flagArgument[0],
                        flagArgument[1],
                    );
                logger.debug("adding cmd switch", flagArgument);
                break;
        }
    }
} else {
    logger.warn(
        "running on an unsupported platform! you are on your own. playback might not work at all due to VMP if you're on macOS or Windows.",
    );
}

app.whenReady()
    .then(async () => {
        const config = new AppConfig(app, {
            currentWebsite: "music",
            enableDiscordRPC: false,
            enableMPRIS: true,
        });
        const currentWebsite =
            config.get("currentWebsite") ?? WebsiteType.Music;
        const DEFAULT_TITLE =
            currentWebsite === WebsiteType.Music
                ? "Apple Music"
                : "Apple Music Classical";

        const getIconFilenames = (website: WebsiteType) => {
            // png used for tray (better compatibility), svg for in-app logo
            return {
                trayPng:
                    website === WebsiteType.Music
                        ? "am-icon.png"
                        : "am-classical-icon.png",
                rendererSvg:
                    website === WebsiteType.Music
                        ? "am-icon.svg"
                        : "am-classical-icon.svg",
            };
        };

        let isQuitting = false;

        logger.info("awaiting components to be ready");
        await components.whenReady();

        const resourcesPath = !app.isPackaged
            ? path.dirname(fileURLToPath(import.meta.url))
            : process.resourcesPath

        const options: Electron.BrowserWindowConstructorOptions = {
            icon: getIconFilenames(currentWebsite).trayPng,
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
            titleBarStyle: "hidden",
            titleBarOverlay: {
                symbolColor: "#fff",
                color: "#1f1f1f",
            },
        };
        // todo: also save maximized state...?
        Object.assign(options, config.get("winBounds"));
        mainWindow = new BrowserWindow(options);
        const debug = mainWindow.webContents.debugger;

        debug.attach("1.3");

        await debug.sendCommand("Fetch.enable", {
            patterns: [
                {
                    urlPattern: `${AM_BASE_URL}/assets/*`,
                    requestStage: "Response",
                },
                {
                    urlPattern: `${AM_BASE_URL}/includes/js-cdn*`,
                    requestStage: "Response",
                },
            ],
        });

        debug.on("message", async (_, method, params) => {
            if (method !== "Fetch.requestPaused") return;

            const { requestId } = params;

            if (params.responseStatusCode) {
                const { body, base64Encoded } = await debug.sendCommand(
                    "Fetch.getResponseBody",
                    { requestId },
                );

                let text = base64Encoded
                    ? Buffer.from(body, "base64").toString()
                    : body;

                const patched = await testPatches(text);

                if (patched.wasModified) {
                    text = patched.script;
                }

                await debug.sendCommand("Fetch.fulfillRequest", {
                    requestId,
                    responseCode: params.responseStatusCode,
                    responseHeaders: params.responseHeaders,
                    body: Buffer.from(text).toString("base64"),
                });
            } else {
                await debug.sendCommand("Fetch.continueRequest", {
                    requestId,
                });
            }
        });
        mainWindow.setTitle(DEFAULT_TITLE);
        mainWindow.webContents.openDevTools({ mode: "right" });
        const player = new Player(ipcMain, mainWindow.webContents);

        function switchWebsite(website: WebsiteType) {
            config.set("currentWebsite", website);
            // restart the app
            app.relaunch();
            app.exit();
        }

        const playbackTemplate = (player: Player) => [
            {
                id: "nowPlaying",
                label: player.metadata?.name
                    ? `${player.metadata.name} - ${player.metadata.artistName}`
                    : "No music playing",
                enabled: false,
            },
            { type: "separator" },
            {
                label: "&Play/Pause",
                click: () => {
                    player.playPause();
                },
            },
            {
                label: "&Next",
                click: () => {
                    player.next();
                },
            },
            {
                label: "P&revious",
                click: () => {
                    player.previous();
                },
            },
            { type: "separator" },
            {
                label: "&Shuffle",
                type: "checkbox",
                checked: player.shuffleMode,
                click: (menuItem: MenuItem) => {
                    player.setShuffle(menuItem.checked);
                },
            },
            {
                label: "&Repeat",
                submenu: [
                    {
                        label: "None",
                        type: "radio",
                        checked: player.repeatMode === MKRepeatMode.None,
                        click: () => {
                            player.setRepeat(MKRepeatMode.None);
                        },
                    },
                    {
                        label: "&Track",
                        type: "radio",
                        checked: player.repeatMode === MKRepeatMode.One,
                        click: () => {
                            player.setRepeat(MKRepeatMode.One);
                        },
                    },
                    {
                        label: "A&lbum/Playlist",
                        type: "radio",
                        checked: player.repeatMode === MKRepeatMode.All,
                        click: () => {
                            player.setRepeat(MKRepeatMode.All);
                        },
                    },
                ],
            },
        ];

        const createMenuTemplate = (player: Player) =>
            [
                {
                    id: "File",
                    label: "&File",
                    submenu: [
                        {
                            label: "Switch website",
                            submenu: [
                                {
                                    label: "Music",
                                    type: "checkbox",
                                    checked: currentWebsite === "music",
                                    click: () => {
                                        switchWebsite(WebsiteType.Music);
                                    },
                                },
                                {
                                    label: "Classical",
                                    type: "checkbox",
                                    checked: currentWebsite === "classical",
                                    click: () => {
                                        switchWebsite(WebsiteType.Classical);
                                    },
                                },
                            ],
                        },
                        {
                            label: "&Back",
                            click: () => {
                                mainWindow.webContents.navigationHistory.goBack();
                            },
                        },
                        {
                            label: "&Forward",
                            click: () => {
                                mainWindow.webContents.navigationHistory.goForward();
                            },
                        },
                        ...(process.env.NODE_ENV === "dev"
                            ? [
                                  { type: "separator" },
                                  {
                                      label: "Reload",
                                      click: () => {
                                          mainWindow.webContents.reload();
                                      },
                                  },
                              ]
                            : []),
                        { type: "separator" },
                        {
                            label: "Minimize to tray",
                            click: () => {
                                mainWindow.hide();
                                buildTrayMenu(player);
                            },
                        },
                        {
                            label: "Quit",
                            click: () => {
                                isQuitting = true;
                                app.quit();
                            },
                        },
                    ],
                },
                {
                    id: "playback",
                    label: "&Playback",
                    submenu: playbackTemplate(player),
                },
                {
                    id: "options",
                    label: "&Options",
                    submenu: [
                        {
                            label: "&Discord rich presence",
                            type: "checkbox",
                            checked: config.get("enableDiscordRPC"),
                            click: (menuItem: MenuItem) => {
                                config.set(
                                    "enableDiscordRPC",
                                    menuItem.checked,
                                );
                            },
                        },
                    ],
                },
            ] as Electron.MenuItemConstructorOptions[];

        const buildMainWindowMenu = async (player: Player) => {
            const menu = Menu.buildFromTemplate(createMenuTemplate(player));
            Menu.setApplicationMenu(menu);
        };

        const { trayPng } = getIconFilenames(currentWebsite);
        const tray = new Tray(path.join(resourcesPath, "assets", trayPng));
        tray.setToolTip(DEFAULT_TITLE);
        //tray.on('click', () => mainWindow.show()) this crashes the app for me for some reason

        const buildTrayMenu = (player: Player) => {
            const menu = Menu.buildFromTemplate([
                ...(playbackTemplate(player) as MenuItemConstructorOptions[]),
                { type: "separator" },
                mainWindow.isVisible()
                    ? {
                          label: "Hide",
                          click: () => {
                              mainWindow.hide();
                              buildTrayMenu(player);
                          },
                      }
                    : {
                          label: "Show",
                          click: () => {
                              mainWindow.show();
                              buildTrayMenu(player);
                          },
                      },
                {
                    label: "Quit",
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    },
                },
            ]);
            tray.setContextMenu(menu);
        };

        const buildMenus = (player: Player) => {
            buildMainWindowMenu(player);
            buildTrayMenu(player);
        };

        // this a workaround for the app not closing properly
        process.on("SIGINT", () => process.exit(0));

        mainWindow.on("page-title-updated", (e) => e.preventDefault());

        mainWindow.on("close", (event) => {
            if (!isQuitting) {
                event.preventDefault();
                mainWindow.hide();
                buildTrayMenu(player);
                return false;
            } else {
                config.set("winBounds", mainWindow.getBounds());
                mainWindow.destroy();
                return true;
            }
        });

        const sendNavState = () => {
            if (!mainWindow.webContents) return;
            const canGoBack =
                mainWindow.webContents.navigationHistory?.canGoBack?.() ??
                false;
            const canGoForward =
                mainWindow.webContents.navigationHistory?.canGoForward?.() ??
                false;
            mainWindow.webContents.send("nav-state", {
                back: canGoBack,
                forward: canGoForward,
            });
        };

        ipcMain.on("nav", (_event, action: string) => {
            if (!mainWindow.webContents) return;
            switch (action) {
                case "back":
                    if (mainWindow.webContents.navigationHistory.canGoBack()) {
                        mainWindow.webContents.navigationHistory.goBack();
                    }
                    break;
                case "forward":
                    if (
                        mainWindow.webContents.navigationHistory.canGoForward()
                    ) {
                        mainWindow.webContents.navigationHistory.goForward();
                    }
                    break;
            }
            setTimeout(sendNavState, 50);
        });

        ipcMain.on("window", (_event, action: string) => {
            switch (action) {
                case "minimize":
                    mainWindow.minimize();
                    break;
                case "maximize":
                    if (mainWindow.isMaximized()) {
                        mainWindow.unmaximize();
                    } else {
                        mainWindow.maximize();
                    }
                    break;
                case "close":
                    app.quit();
                    break;
            }
        });

        //mainWindow.on('ready-to-show', () => mainWindow.show())

        const currentWebsiteURL =
            config.get("currentWebsite") === "music"
                ? AM_BASE_URL
                : AM_CLASSICAL_BASE_URL;

        const geo = await getAppleGeolocation(config);

        let amUrl = currentWebsiteURL;
        if (geo && typeof geo === "string") {
            amUrl = `${currentWebsiteURL}/${geo.toLowerCase()}`;
        }
        mainWindow.loadURL(amUrl);

        if (config.get("enableMPRIS") && currentPlatform === "linux") {
            player.addIntegration(new MPRISIntegration(player));
        }

        if (config.get("enableDiscordRPC")) {
            player.addIntegration(
                new DiscordIntegration(player, currentWebsite),
            );
        }

        player.initialize();

        mainWindow.webContents.on("did-finish-load", () => sendNavState());
        mainWindow.webContents.on("did-navigate-in-page", () => sendNavState());
        mainWindow.webContents.on("did-navigate", () => sendNavState());

        mainWindow.webContents.on("before-input-event", (event, input) => {
            if (input.alt && input.shift && input.key.toLowerCase() === "i") {
                mainWindow.webContents.openDevTools();
                return;
            }
        });

        mainWindow.webContents.setWindowOpenHandler(() => {
            return { action: "deny" };
        });

        player.on("nowPlaying", (metadata: TrackMetadata) => {
            if (metadata) {
                mainWindow.setTitle(
                    `${metadata.name} - ${metadata.artistName} — ${DEFAULT_TITLE}`,
                );
            }
            buildMenus(player);
        });
        player.on("playbackState", ({ state }) => {
            if (player.metadata) {
                switch (state) {
                    case MKPlaybackState.Paused:
                    case MKPlaybackState.Playing:
                        mainWindow.setTitle(
                            `${player.metadata?.name} - ${player.metadata?.artistName} — ${DEFAULT_TITLE}`,
                        );
                        break;
                    default:
                        mainWindow.setTitle(DEFAULT_TITLE);
                        break;
                }
            } else {
                mainWindow.setTitle(DEFAULT_TITLE);
            }
            buildMenus(player);
        });

        player.on("shuffle", () => buildMenus(player));
        player.on("repeat", () => buildMenus(player));

        config.on("setKey", () => buildMenus(player));
        config.on("deletedKey", () => buildMenus(player));

        buildMenus(player);
        return;
    })
    .catch(console.error);
