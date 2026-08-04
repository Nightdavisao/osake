import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import type { Plugin } from "esbuild";

export function rawImportPlugin(): Plugin {
	return {
		name: "raw-import",
		setup(build) {
			build.onResolve({ filter: /\?raw$/ }, async args => {
				const cleanPath = args.path.replace(/\?raw$/, "");

				const resolved = await build.resolve(cleanPath, {
					kind: args.kind,
					resolveDir: args.resolveDir,
				});

				if (resolved.errors.length > 0) {
					return { errors: resolved.errors };
				}

				return { path: resolved.path, namespace: "raw-import" };
			});

			build.onLoad({ filter: /.*/, namespace: "raw-import" }, async args => {
				const result = await esbuild.build({
					entryPoints: [args.path],
					bundle: true,
					format: "iife",
					write: false,
					platform: "browser",
					loader: {
						".svg": "text",
						".png": "dataurl",
						".css": "text",
					},
					jsxFactory: "h",
					jsxFragment: "Fragment",
					tsconfig: "./tsconfig.json",
				});

				if (result.errors.length > 0) {
					return { errors: result.errors };
				}

				if (!result.outputFiles) {
					return null;
				}

				const compiledCode = result.outputFiles[0].text;

				return {
					contents: compiledCode,
					loader: "text",
					watchFiles: [args.path],
				};
			});
		},
	};
}

const common: esbuild.BuildOptions = {
	outbase: "src",
	bundle: true,
	treeShaking: true,
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
	plugins: [rawImportPlugin()],
};

// const renderer: esbuild.BuildOptions = {
// 	entryPoints: ["src/app/renderer/inject.tsx"],
// 	outfile: "dist/inject.js",
// 	format: "iife",
// 	platform: "browser",
// 	sourcemap: false,
// };

const configs: esbuild.BuildOptions[] = [
	{
		...common,
		...electron,
	},
	{
		...common,
		...preload,
	},
	// {
	// 	...common,
	// 	...renderer,
	// },
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
