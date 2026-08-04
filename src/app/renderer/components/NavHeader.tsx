// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "jsx-dom";
import backIconSvg from "~/extra/svg/back.svg";
import appMenuIconSvg from "~/extra/svg/ellipsis.svg";
import forwardIconSvg from "~/extra/svg/forward.svg";

const iconButtonStyle = {
	width: "15px",
	height: "15px",
	color: "var(--navigation-item-text-color), var(--systemPrimary)",
};

export function NavHeader() {
	return (
		<div
			style={{
				zIndex: "5",
				alignItems: "center",
				marginTop: "4px",
				padding: "18px",
				display: "flex",
				gap: "8px",
			}}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					flexGrow: "1",
				}}>
				<button
					style={iconButtonStyle}
					innerHTML={backIconSvg}
					onClick={() => history.back()}
				/>
				<button
					style={iconButtonStyle}
					innerHTML={forwardIconSvg}
					onClick={() => history.forward()}
				/>
			</div>
			<button
				style={{ width: "28px", height: "28px" }}
				innerHTML={appMenuIconSvg}
				onClick={(event: Event) => window.AMWrapper.openAppMenu(event)}
			/>
		</div>
	);
}
