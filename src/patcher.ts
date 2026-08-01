import log4js from "log4js";
const { getLogger } = log4js;

const logger = getLogger('patcher')

const PATCHES = [
    // these only stops Apple Music from overriding metadata from uploaded cloud items
    {
        name: "Prevent metadata linking (if the playing item is a cloud item) on floating player",
        find: /(!([a-z])\.isRadioStation\)\s*try\s*\{)\s*([a-z])\s*=\s*(await\s+this\.jet\.dispatch\s*\(\s*[a-z]+\(\s*\{[\s\S]*?\}\s*\)\s*\)\s*)/,
        replace: "$1$3=$2.isCloudItem?{albumName:$2.albumName}:$4"
    },
    {
        name: "Prevent metadata linking (if the playing item is a cloud item) on immersive/LCD (?) mode",
        find: /(async fetchCatalogId\(\)\{)([^}]*\})/,
        replace: "$1if (this.currentItem && this.currentItem.isCloudItem) return;$2"
    }
]

export async function testPatches(script: string) {
    let wasModified = false
    for (const patch of PATCHES) {
        // reset lastIndex in case this regex has the g flag and was used before
        patch.find.lastIndex = 0
        if (patch.find.test(script)) {
            // TODO: pick up the script URL!
            logger.info(`successfully patched script code with the patch "${patch.name}"`)
            patch.find.lastIndex = 0
            // replacement argument might be a function
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            script = script.replace(patch.find as any, patch.replace as any)
            wasModified = true
        }
    }
    return {
        wasModified,
        script
    }
}