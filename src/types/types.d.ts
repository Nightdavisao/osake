/* eslint-disable @typescript-eslint/no-explicit-any */
export declare global {
	export interface AMWrapper {
		ipcRenderer: {
			send: (channel: string, data: any) => void;
			on: (channel: string, func: (...args: any[]) => void) => void;
		};
		openAppMenu: (event: Event) => void;
	}

	interface Window {
		AMWrapper: AMWrapper;
		MusicKit: any;
	}
}
