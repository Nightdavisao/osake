/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "jsx-dom";

export function DragRegion() {
	const region = (
		<div
			style={{
				height: "env(titlebar-area-height, 0)" as any,
				position: "fixed",
				width: "100%",
			}}
		/>
	);
	region.style.setProperty("app-region", "drag");
	region.style.zIndex = "99";
	return region;
}
