import { BrowserWindow, Menu, MenuItem, Tray } from "electron";
import path from "node:path";
import { MKRepeatMode } from "~/types/enums";
import { AppState } from "./state";
import {
	getServiceIconFilenames,
	getResourcesPath,
	getServiceName,
} from "./utils";

export const playbackTemplate = (
	state: AppState,
): Electron.MenuItemConstructorOptions[] => {
	const playbackOptions = state.getAllowedPlaybackOptions();

	const options: Electron.MenuItemConstructorOptions[] = [
		{
			label:
				state.playerSink?.metadata?.name ?
					`${state.playerSink?.metadata.name} - ${state.playerSink.metadata.artistName}`
				:	state.locale.t("common.notPlaying"),
			enabled: false,
		},
		{ type: "separator" },
		{
			label: state.locale.t("playback.playPause"),
			click: () => state.playerSink?.playPause(),
		},
		{
			label: state.locale.t("playback.next"),
			click: () => state.playerSink?.next(),
		},
		{
			label: state.locale.t("playback.previous"),
			click: () => {
				state.playerSink?.previous();
			},
		},
		{ type: "separator" },
		...(playbackOptions.shuffle ?
			[
				{
					label: state.locale.t("playback.shuffle"),
					type: "checkbox" as const,
					checked: state.playerSink?.shuffleMode,
					click: (menuItem: MenuItem) => {
						state.playerSink?.setShuffle(menuItem.checked);
					},
				},
			]
		:	[]),
		...(playbackOptions.repeat ?
			[
				{
					label: state.locale.t("playback.repeat.label"),
					submenu: [
						{
							label: state.locale.t("common.none"),
							type: "radio" as const,
							checked: state.playerSink?.repeatMode === MKRepeatMode.None,
							click: () => {
								state.playerSink?.setRepeat(MKRepeatMode.None);
							},
						},
						{
							label: state.locale.t("playback.repeat.one"),
							type: "radio" as const,
							checked: state.playerSink?.repeatMode === MKRepeatMode.One,
							click: () => {
								state.playerSink?.setRepeat(MKRepeatMode.One);
							},
						},
						{
							label: state.locale.t("playback.repeat.all"),
							type: "radio" as const,
							checked: state.playerSink?.repeatMode === MKRepeatMode.All,
							click: () => {
								state.playerSink?.setRepeat(MKRepeatMode.All);
							},
						},
					],
				},
			]
		:	[]),
	];

	return options;
};

const createMenuTemplate = (
	state: AppState,
): Electron.MenuItemConstructorOptions[] => [
	{
		label: state.locale.t("menu.switchService"),
		submenu: [
			{
				label: state.locale.t("common.service.music.label"),
				type: "checkbox",
				checked: state.currentService === "music",
				click: () => state.switchService("music"),
			},
			{
				label: state.locale.t("common.service.classical.label"),
				type: "checkbox",
				checked: state.currentService === "classical",
				click: () => state.switchService("classical"),
			},
			{
				label: state.locale.t("common.service.podcasts.label"),
				type: "checkbox",
				checked: state.currentService === "podcasts",
				click: () => state.switchService("podcasts"),
			},
		],
	},
	{ type: "separator" },
	{ label: state.locale.t("common.integrations"), enabled: false },
	{
		label: state.locale.t("menu.integrations.discord.label"),
		type: "checkbox",
		checked: state.config?.get("enableDiscordRPC"),
		click: (menuItem: MenuItem) => {
			state.config?.set("enableDiscordRPC", menuItem.checked);
		},
	},
	{ type: "separator" },
	{
		label: state.locale.t("menu.misc.reload"),
		click: () => state.mainWindow?.webContents.reload(),
	},
	{
		label: state.locale.t("menu.misc.minimize"),
		click: () => state.toggleWindow(),
	},
	{
		label: state.locale.t("menu.misc.quit"),
		click: () => state.quitApp(),
	},
];

export const openAppMenu = (
	state: AppState,
	event: Electron.IpcMainInvokeEvent,
) => {
	const menu = Menu.buildFromTemplate(createMenuTemplate(state));
	menu.popup({
		window: BrowserWindow.fromWebContents(event.sender) ?? undefined,
	});
};

export const buildTrayMenu = (state: AppState) => {
	const menu = Menu.buildFromTemplate([
		...playbackTemplate(state),
		{ type: "separator" },
		{
			label:
				state.mainWindow?.isVisible() ?
					state.locale.t("common.hide")
				:	state.locale.t("common.show"),
			click: () => state.toggleWindow(),
		},
		{
			label: state.locale.t("menu.misc.quit"),
			click: () => state.quitApp(),
		},
	]);
	state.tray?.setContextMenu(menu);
};

export function setupTray(state: AppState) {
	const { trayPng } = getServiceIconFilenames(state.currentService);
	state.tray = new Tray(path.join(getResourcesPath(), "assets", trayPng));
	state.tray.setToolTip(getServiceName(state.currentService));
	buildTrayMenu(state);
}
