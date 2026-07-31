import * as fs from "node:fs/promises";
import * as esbuild from "esbuild";

const common = {
    outbase: "src",
    bundle: true,
    sourcemap: true,
    packages: "external",
    external: ["electron", "x11"],
};

const electron = {
    entryPoints: ["src/main.ts"],
    outdir: "dist",
    format: "esm",
    platform: "node",
    target: "node22",
};

const preload = {
    entryPoints: ["src/preload.ts"],
    outfile: "dist/preload.cjs",
    format: "cjs",
    platform: "node",
    target: "node22",
};

const configs = [
    {
        ...common,
        ...electron,
    },
    {
        ...common,
        ...preload,
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
