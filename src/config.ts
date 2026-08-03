/* eslint-disable @typescript-eslint/no-explicit-any */
import { App } from "electron/main";
import fs from "fs";
import log4js, { Logger } from "log4js";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { AppOptions } from "~/types/interfaces";

export class AppConfig extends EventEmitter {
	app: App;
	logger: Logger;
	default: AppOptions;
	current: AppOptions;

	constructor(app: App, defaultOptions: AppOptions) {
		super();
		this.app = app;
		this.logger = log4js.getLogger("appConfig");
		this.logger.level = "debug";
		this.default = defaultOptions;
		this.current = this._load() || defaultOptions;
	}

	private getConfigPath() {
		return join(this.app.getPath("userData"), "config.json");
	}

	get(key: string) {
		if (Object.prototype.hasOwnProperty.call(this.current, key))
			return this.current[key];

		return this.default[key];
	}

	set(key: string, value: any) {
		this.current[key] = value;
		this.emit("setKey", key);
		this._save();
	}

	delete(key: string) {
		delete this.current[key];
		this.emit("deletedKey", key);
		this._save();
	}

	private _save() {
		try {
			this.logger.info("saving config file", this.getConfigPath());
			fs.writeFileSync(
				this.getConfigPath(),
				JSON.stringify(this.current, null, 4),
			);
		} catch (error) {
			this.logger.error("error saving config file", error);
		}
	}

	private _load() {
		this.logger.info("loading config file", this.getConfigPath());

		try {
			const data = fs.readFileSync(this.getConfigPath(), "utf8");
			this.logger.info("config file loaded", data);

			return JSON.parse(data);
		} catch (error) {
			this.logger.error("error loading config file", error);
		}
	}
}
