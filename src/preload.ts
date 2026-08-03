/* eslint-disable @typescript-eslint/no-explicit-any */

import { webFrame } from "electron";
import fs from "fs";
import path from "path";
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("AMWrapper", {
	ipcRenderer: {
		send: (channel: string, data: any) => {
			ipcRenderer.send(channel, data);
		},
		on: (channel: string, func: (...args: any[]) => void) => {
			ipcRenderer.on(channel, func);
		},
	},
	openAppMenu: (event: Event) => ipcRenderer.invoke("openAppMenu", event),
} as AMWrapper);

const injectedCode = fs.readFileSync(
	path.join(__dirname, "inject.js"),
	"utf-8",
);

webFrame.executeJavaScript(injectedCode);
