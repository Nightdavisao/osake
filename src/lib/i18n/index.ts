import { getResourcesPath } from "~/app/utils";
import { join } from "path";
import { glob } from "glob";
import { load } from "js-yaml";
import { readFile } from "fs/promises";
import log4js, { Logger } from "log4js";

export type LocaleItem = "en-US" | "en-GB" | "pt-BR";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = Record<string, any>;
type LocaleResolver = (key: string) => string | undefined;

export interface AppLocale {
	t(key: string, vars?: Record<string, string | number>): string;
}

export class DumbLocaleTFallback implements AppLocale {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	t(key: string, vars?: Record<string, string | number>): string {
		return key;
	}
}

export class AppLocaleFactory {
	logger: Logger;
	locale: LocaleItem;
	dict: Dict | null = null;
	fallback: LocaleItem = "en-US";
	fallbackDict: Dict | null = null;
	fallbackResolve: LocaleResolver | null = null;

	constructor(locale: LocaleItem = this.fallback) {
		this.logger = log4js.getLogger("localeFactory");
		this.logger.level = "debug";
		this.locale = locale;
	}

	private async getDict() {
		const localePath = join(
			getResourcesPath(),
			"assets",
			"locales",
			this.locale,
		);
		const localeGlob = `**.{yml,yaml}`;

		const files = await glob(localeGlob, {
			cwd: localePath,
		});
		this.logger.debug(
			`locale files count: ${files.length}`,
			files,
			localeGlob,
			localePath,
		);
		for (const file of files) {
			const document = await readFile(join(localePath, file), "utf-8");
			const dict = load(document) as Dict;
			this.dict = this.dict ? Object.assign(this.dict, dict) : dict;
		}
		if (this.dict)
			this.logger.debug(
				`loaded ${Object.keys(this.dict).length} entries from locale files`,
				this.dict,
			);
		else this.logger.warn("nothing was loaded from locales!!!!!!!!!!!!!!!");
		return this.dict;
	}

	private async getFallbackDict() {
		if (this.locale === this.fallback) return;

		const factory = new AppLocaleFactory();
		this.fallbackDict = await factory.getDict();
		this.fallbackResolve = factory.resolve;
	}

	private async refreshLocales() {
		await Promise.all([this.getDict(), this.getFallbackDict()]);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	resolve(key: string): any {
		return key.split(".").reduce((o, k) => o?.[k], this.dict);
	}

	async getT(): Promise<AppLocale> {
		if (!this.dict && !this.fallbackDict && !this.fallbackResolve) {
			await this.refreshLocales();
		}

		const clazz = class implements AppLocale {
			resolve: LocaleResolver;
			fallbackResolve: LocaleResolver;

			constructor(res: LocaleResolver, fallbackRes: LocaleResolver) {
				this.resolve = res;
				this.fallbackResolve = fallbackRes;
			}

			t(key: string, vars?: Record<string, string | number>): string {
				let str = this.resolve(key) ?? this.fallbackResolve(key) ?? key;
				if (vars) {
					for (const [k, v] of Object.entries(vars)) {
						str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), String(v));
					}
				}
				return str;
			}
		};

		if (this.fallbackResolve)
			return new clazz(
				this.resolve.bind(this),
				this.fallbackResolve.bind(this),
			);
		else return new clazz(this.resolve.bind(this), this.resolve.bind(this));
	}
}
