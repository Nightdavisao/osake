/* eslint-disable @typescript-eslint/no-explicit-any */
import { setupEventListener } from "./event";

// defines a proxy for window.MusicKit
// reminder that this needs to be ran before any script from the website(s)
export function proxyMusicKit() {
	const handler = {
		get(target: any, prop: any) {
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
		set(target: any, prop: any, value: any): any {
			return Reflect.set(target, prop, value, target);
		},
	};

	const proxyCache = new WeakMap();
	function wrapInstance(real: any) {
		if (!real) return real;
		if (proxyCache.has(real)) return proxyCache.get(real);

		const proxy = new Proxy(real, handler);
		proxyCache.set(real, proxy);
		setupEventListener(proxy).catch(console.error);
		return proxy;
	}

	// we are doing this so that we don't need to "win a race" in the first place
	// preload scripts get loaded before the website itself
	let _musicKit: any;
	Object.defineProperty(window, "MusicKit", {
		configurable: true,
		get() {
			return _musicKit;
		},
		set(mk) {
			console.log("called set on mk proxy");

			const musicKitObjectHandler = {
				get(target: any, prop: any) {
					if (prop === "getInstance") {
						const originalGetInstance = target.getInstance.bind(target);
						return () => wrapInstance(originalGetInstance());
					}
					const value = Reflect.get(target, prop, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
				set(target: any, prop: any, value: any) {
					return Reflect.set(target, prop, value, target);
				},
			};
			_musicKit = new Proxy(mk, musicKitObjectHandler);
		},
	});
}

export function noopSentry() {
	console.log("nooping sentry");

	Object.defineProperty(window, "__SENTRY__", {
		configurable: false,
		get() {
			return null;
		},
		set() {
			Reflect.deleteProperty(window, "__SENTRY__");
		},
	});
}
