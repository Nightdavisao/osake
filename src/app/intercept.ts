import { testPatches } from "~/patcher";
import log4js from "log4js";

const logger = log4js.getLogger("intercept");
logger.level = "debug";

export async function interceptFetchResponse(dbg: Electron.Debugger) {
	dbg.attach("1.3");

	await dbg.sendCommand("Fetch.enable", {
		patterns: [
			{
				urlPattern: `*://*.apple.com/assets/*`,
				requestStage: "Response",
				resourceType: "Script",
			},
			{
				urlPattern: `*://*.apple.com/includes/js-cdn*`,
				requestStage: "Response",
				resourceType: "Script",
			},
		],
	});

	dbg.on("message", async (_, method, params) => {
		if (method !== "Fetch.requestPaused") return;

		const { requestId } = params;

		if (params.responseStatusCode) {
			const { body, base64Encoded } = await dbg.sendCommand(
				"Fetch.getResponseBody",
				{ requestId },
			);
			logger.debug("url", params.request.url);

			let text = base64Encoded ? Buffer.from(body, "base64").toString() : body;

			const patched = await testPatches(text);

			if (patched.wasModified) {
				text = patched.script;
			}

			await dbg.sendCommand("Fetch.fulfillRequest", {
				requestId,
				responseCode: params.responseStatusCode,
				responseHeaders: params.responseHeaders,
				body: Buffer.from(text).toString("base64"),
			});
		} else {
			await dbg.sendCommand("Fetch.continueRequest", {
				requestId,
			});
		}
	});
}
