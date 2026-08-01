import { Menu, MenuItem, Tray } from "electron";
import { MKRepeatMode } from "../@types/enums";
import { AppState } from "./state";
import path from "node:path";
import { DEFAULT_WINDOW_TITLE, getIconFilenames, getResourcesPath } from "./utils";

export const playbackTemplate = (state: AppState): Electron.MenuItemConstructorOptions[] => [
    {
        id: "nowPlaying",
        label: state.playerSink?.metadata?.name
            ? `${state.playerSink?.metadata.name} - ${state.playerSink.metadata.artistName}`
            : "No music playing",
        enabled: false,
    },
    { type: "separator" },
    {
        label: "&Play/Pause",
        click: () => state.playerSink?.playPause(),
    },
    {
        label: "&Next",
        click: () => state.playerSink?.next(),
    },
    {
        label: "P&revious",
        click: () => {
            state.playerSink?.previous();
        },
    },
    { type: "separator" },
    {
        label: "&Shuffle",
        type: "checkbox",
        checked: state.playerSink?.shuffleMode,
        click: (menuItem: MenuItem) => {
            state.playerSink?.setShuffle(menuItem.checked);
        },
    },
    {
        label: "&Repeat",
        submenu: [
            {
                label: "None",
                type: "radio",
                checked: state.playerSink?.repeatMode === MKRepeatMode.None,
                click: () => {
                    state.playerSink?.setRepeat(MKRepeatMode.None);
                },
            },
            {
                label: "&Track",
                type: "radio",
                checked: state.playerSink?.repeatMode === MKRepeatMode.One,
                click: () => {
                    state.playerSink?.setRepeat(MKRepeatMode.One);
                },
            },
            {
                label: "A&lbum/Playlist",
                type: "radio",
                checked: state.playerSink?.repeatMode === MKRepeatMode.All,
                click: () => {
                    state.playerSink?.setRepeat(MKRepeatMode.All);
                },
            },
        ],
    },
];

const createMenuTemplate = (state: AppState): Electron.MenuItemConstructorOptions[] =>
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
                            checked: state.currentWebsite === "music",
                            click: () =>
                                state.switchWebsite(state.currentWebsite),
                        },
                        {
                            label: "Classical",
                            type: "checkbox",
                            checked: state.currentWebsite === "classical",
                            click: () =>
                                state.switchWebsite(state.currentWebsite),
                        },
                    ],
                },
                {
                    label: "&Back",
                    click: () =>
                        state.mainWindow?.webContents.navigationHistory.goBack(),
                },
                {
                    label: "&Forward",
                    click: () =>
                        state.mainWindow?.webContents.navigationHistory.goForward(),
                },
                { type: "separator" },
                {
                    label: "Reload",
                    click: () => state.mainWindow?.webContents.reload(),
                },

                { type: "separator" },
                {
                    label: "Minimize to tray",
                    click: () => state.toggleWindow(),
                },
                {
                    label: "Quit",
                    click: () => state.quitApp(),
                },
            ],
        },
        {
            id: "options",
            label: "&Options",
            submenu: [
                {
                    label: "&Discord rich presence",
                    type: "checkbox",
                    checked: state.config?.get("enableDiscordRPC"),
                    click: (menuItem: MenuItem) => {
                        state.config?.set("enableDiscordRPC", menuItem.checked);
                    },
                },
            ],
        },
    ]

const buildMainWindowMenu = async (state: AppState) => {
    const menu = Menu.buildFromTemplate(createMenuTemplate(state));
    Menu.setApplicationMenu(menu);
};

export const buildTrayMenu = (state: AppState) => {
    const menu = Menu.buildFromTemplate([
        ...playbackTemplate(state),
        { type: "separator" },
        {
            label: state.mainWindow?.isVisible() ? "Hide" : "Show",
            click: () => state.toggleWindow(),
        },
        {
            label: "Quit",
            click: () => state.quitApp(),
        },
    ]);
    state.tray?.setContextMenu(menu);
};

export function setupTray(state: AppState) {
    const { trayPng } = getIconFilenames(state.currentWebsite);
    state.tray = new Tray(path.join(getResourcesPath(), "assets", trayPng));
    state.tray.setToolTip(DEFAULT_WINDOW_TITLE);
    buildTrayMenu(state)
}

