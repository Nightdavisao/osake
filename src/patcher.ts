import log4js from "log4js";

const logger = log4js.getLogger("patcher");
logger.level = "debug";

const PATCHES = [
	{
		name: "Prevent metadata linking (if the playing item is a cloud item) on floating player",
		find: /(!([a-z])\.isRadioStation\)\s*try\s*\{)\s*([a-z])\s*=\s*(await\s+this\.jet\.dispatch\s*\(\s*[A-Za-z]+\(\s*\{[\s\S]*?\}\s*\)\s*\)\s*)/,
		replace: "$1$3=$2.isCloudItem?{albumName:$2.albumName}:$4",
	},
	{
		name: "Prevent metadata linking (if the playing item is a cloud item) on immersive/LCD (?) mode",
		find: /(async fetchCatalogId\(\)\{)([^}]*\})/,
		replace:
			"$1if (this.currentItem && this.currentItem.isCloudItem) return;$2",
	},
	{
		name: "Do not debounce event dispatch",
		find: /setTimeout\s*\(\s*\(\)\s*=>\s*(document\.dispatchEvent\([A-Za-z]\))\)/,
		replace: "$1",
	},
	{
		name: "Invalidate stale preloaded next track on queue changes",
		find: /([a-z])\.queue\.isInitiated\s*\?\s*[a-z]\.queue\.isEmpty\s*\|\|\s*\(yield\s*e\.queueAutoplayTracks\(\),\s*[a-z]\.prepareToPlayNextItem\(\)\)\s*:\s*\([a-z]\.stopAutoplay\(\),\s*[a-z]\.startAutoplay\(\)\)/,
		replace:
			"!$1.queue.isInitiated?$1.queue.isEmpty||($1._mediaItemPlayback.clearNextManifest(),yield e.prepareToPlayNextItem(),yield $1.queueAutoplayTracks()):($1.stopAutoplay(),$1.startAutoplay())",
	},
];

function getSurroundingCode(
	source: string,
	index: number,
	radius = 800,
): string {
	const start = Math.max(0, index - radius);
	const end = Math.min(source.length, index + radius);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < source.length ? "…" : "";
	return prefix + source.slice(start, end) + suffix;
}

export async function testPatches(script: string) {
	let wasModified = false;
	for (const patch of PATCHES) {
		// reset lastIndex in case this regex has the g flag and was used before
		patch.find.lastIndex = 0;
		if (patch.find.test(script)) {
			patch.find.lastIndex = 0;
			// replacement argument might be a function
			const match = patch.find.exec(script);

			if (match) {
				const context = getSurroundingCode(script, match.index);
				logger.info(
					`successfully patched script code with the patch "${patch.name}" near\n\n`
						+ context,
				);
			} else {
				logger.info(
					`successfully patched script code with the patch "${patch.name}"`,
				);
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			script = script.replace(patch.find as any, patch.replace as any);
			script = `// Patch "${patch.name}" applied` + "\n" + script;

			wasModified = true;
		}
	}
	return {
		wasModified,
		script,
	};
}
