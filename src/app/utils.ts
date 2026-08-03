import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebsiteService } from "~/@types/enums";

export const DEFAULT_WINDOW_TITLE = "Apple Music";

export const getResourcesPath = () =>
	!app.isPackaged ?
		path.dirname(fileURLToPath(import.meta.url))
	:	process.resourcesPath;

export const isLiquidGlassDesign = (website: WebsiteService) =>
	website === "music" || website === "podcasts";

export const getIconFilenames = (website: WebsiteService) => {
	// png used for tray (better compatibility), svg for in-app logo
	let trayPng = "am-icon.png";
	let rendererSvg = "am-icon.svg";

	switch (website) {
		case "classical":
			trayPng = "am-classical-icon.png";
			rendererSvg = "am-classical-icon.svg";
			break;
		case "podcasts":
			trayPng = "podcasts.png";
			rendererSvg = "podcasts.svg";
			break;
		default:
			trayPng = "am-icon.png";
			rendererSvg = "am-icon.svg";
			break;
	}

	return {
		trayPng,
		rendererSvg,
	};
};
