import { app } from "electron";
import log4js from "log4js";
import os from "node:os";
import { AppState } from "~/app/state";

const logger = log4js.getLogger("main");
logger.level = "debug";

const appState = new AppState();

// https://wiki.cachyos.org/configuration/enabling_hardware_acceleration_in_google_chrome/
const CMD_LINE_FLAGS = [
    "ignore-gpu-blocklist",
    "ignore-gpu-rasterization",
    "enable-zero-copy",
    [
        "enable-feature",
        "UseOzonePlatform,WaylandWindowDecorations,VaapiVideoDecoder,AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL,AcceleratedVideoEncoder,UseMultiPlaneFormatForHardwareVideo,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan",
    ],
    ["disable-features", "MediaSessionService"],
];

if (os.platform() === "linux") {
    for (const flagArgument of CMD_LINE_FLAGS) {
        switch (typeof flagArgument) {
            case "string":
                app.commandLine.appendArgument(flagArgument);
                logger.debug("adding argument", flagArgument);
                break;
            default:
                if (Array.isArray(flagArgument))
                    app.commandLine.appendSwitch(
                        flagArgument[0],
                        flagArgument[1],
                    );
                logger.debug("adding cmd switch", flagArgument);
                break;
        }
    }
} else {
    logger.warn(
        "running on an unsupported platform! you are on your own. playback might not work at all due to VMP if you're on macOS or Windows.",
    );
}

app.whenReady().then(appState.startup.bind(appState)).catch(console.error);
