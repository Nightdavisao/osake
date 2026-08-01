import * as fs from "node:fs/promises";
import * as esbuild from "esbuild";

const common = {
    outbase: "src",
    bundle: true,
    sourcemap: true,
    external: ["electron", "x11"],
    loader: {
        ".svg": "text",
        ".png": "dataurl",
        ".css": "text"
    },
    jsxFactory: "h",
    jsxFragment: "Fragment",
};

const electron = {
    entryPoints: ["src/main.ts"],
    outdir: "dist",
    packages: "external",
    format: "esm",
    platform: "node",
    target: "node22",
};

const preload = {
    entryPoints: ["src/preload.tsx"],
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
