/* eslint-disable @typescript-eslint/no-explicit-any */
import { App } from "electron/main";
import { AppOptions } from "./@types/interfaces";
import fs from "fs";
import { EventEmitter } from "node:events";
import { Logger } from "log4js";
import log4js from "log4js";

export class AppConfig extends EventEmitter {
    app: App;
    logger: Logger;
    default: AppOptions;
    current: AppOptions;

    constructor(app: App, defaultOptions: AppOptions) {
        super();
        this.app = app;
        this.logger = log4js.getLogger("app-config");
        this.logger.level = "debug";
        this.default = defaultOptions;
        this.current = this._load() || defaultOptions;
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
        const userData = this.app.getPath("userData");
        const configFile = `${userData}/config.json`;
        try {
            this.logger.info("saving config file", configFile);
            fs.writeFileSync(configFile, JSON.stringify(this.current, null, 4));
        } catch (error) {
            this.logger.error("error saving config file", error);
        }
    }

    private _load() {
        const userData = this.app.getPath("userData");
        const configFile = `${userData}/config.json`;
        this.logger.info("loading config file", configFile);

        try {
            const data = fs.readFileSync(configFile, "utf8");
            this.logger.info("config file loaded", data);

            return JSON.parse(data);
        } catch (error) {
            this.logger.error("error loading config file", error);
        }
    }
}
