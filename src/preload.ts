/* eslint-disable @typescript-eslint/no-explicit-any */

import { webFrame } from "electron";
import injectedCode from "./app/renderer/inject.ts?raw";
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

webFrame.executeJavaScript(injectedCode);
