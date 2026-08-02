import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_WINDOW_TITLE = "Apple Music";

export const getResourcesPath = () =>
	!app.isPackaged ?
		path.dirname(fileURLToPath(import.meta.url))
	:	process.resourcesPath;

export const getIconFilenames = (website: "music" | "classical") => {
	// png used for tray (better compatibility), svg for in-app logo
	return {
		trayPng: website === "music" ? "am-icon.png" : "am-classical-icon.png",
		rendererSvg:
			website === "music" ? "am-icon.svg" : "am-classical-icon.svg",
	};
};
