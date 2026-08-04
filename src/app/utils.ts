import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebsiteService } from "~/types/enums";

export const getResourcesPath = () =>
	!app.isPackaged ?
		path.dirname(fileURLToPath(import.meta.url))
	:	process.resourcesPath;

export const isLiquidGlassDesign = (website: WebsiteService) =>
	website === "music" || website === "podcasts";

export const getServiceIconFilenames = (website: WebsiteService) => {
	// png used for tray (better compatibility), svg for in-app logo
	switch (website) {
		case "classical":
			return {
				trayPng: "am-classical-icon.png",
				rendererSvg: "am-classical-icon.svg",
			};
		case "podcasts":
			return {
				trayPng: "podcasts.png",
				rendererSvg: "podcasts.svg",
			};
		default:
			return {
				trayPng: "am-icon.png",
				rendererSvg: "am-icon.svg",
			};
	}
};

export const getServiceName = (website: WebsiteService) => {
	switch (website) {
		case "classical":
			return "Apple Music Classical";
		case "podcasts":
			return "Apple Podcasts";
		default:
			return "Apple Music";
	}
};
