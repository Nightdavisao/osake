import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";

const common: esbuild.BuildOptions = {
	outbase: "src",
	bundle: true,
	sourcemap: true,
	external: ["electron", "x11"],
	loader: {
		".svg": "text",
		".png": "dataurl",
		".css": "text",
	},
	jsxFactory: "h",
	jsxFragment: "Fragment",
};

const electron: esbuild.BuildOptions = {
	entryPoints: ["src/main.ts"],
	outdir: "dist",
	packages: "external",
	format: "esm",
	platform: "node",
	target: "node22",
};

const preload: esbuild.BuildOptions = {
	entryPoints: ["src/preload.ts"],
	outfile: "dist/preload.cjs",
	format: "cjs",
	external: ["electron"],
	platform: "node",
	target: "node22",
};

const renderer: esbuild.BuildOptions = {
	entryPoints: ["src/inject.tsx"],
	outfile: "dist/inject.js",
	format: "iife",
	platform: "browser",
	sourcemap: false,
};

const configs: esbuild.BuildOptions[] = [
	{
		...common,
		...electron,
	},
	{
		...common,
		...preload,
	},
	{
		...common,
		...renderer,
	},
];

await fs.cp("assets", "dist/assets", { recursive: true });

if (process.argv.includes("--watch")) {
	for (const cfg of configs) {
		const ctx = await esbuild.context(cfg);
		await ctx.watch();
	}

	console.log("Watching...");
} else {
	await Promise.all(configs.map(esbuild.build));
}
