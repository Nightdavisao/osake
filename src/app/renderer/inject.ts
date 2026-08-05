import styleFixtures from "~/extra/css/fixtures.css";
import classicalFixtures from "~/extra/css/classicalOnly.css";
import liquidFixtures from "~/extra/css/liquidOnly.css";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "jsx-dom";
import { isClassical, shouldObserveChildMutations } from "./utils";
import { DragRegion } from "./components/DragRegion";
import { NavHeader } from "./components/NavHeader";
import { noopSentry, proxyMusicKit } from "./proxy";

const injectedElements = {
	navigationHeader: false,
	scrollablePage: false,
};

const childObserver = new MutationObserver(
	(mutationsList: MutationRecord[]) => {
		for (const mutation of mutationsList) {
			if (mutation.type !== "childList") continue;

			mutation.addedNodes.forEach(node => {
				if (!(node instanceof HTMLElement)) return;

				if (node.classList.contains("navigation__header")) {
					node.parentNode?.prepend(NavHeader());
					injectedElements.navigationHeader = true;
				}

				if (node.id === "scrollable-page") {
					console.log("adding draggable app region");
					document.querySelector(".app-container")?.prepend(DragRegion());
					injectedElements.scrollablePage = true;
				}
			});

			if (Object.values(injectedElements).every(Boolean)) {
				childObserver.disconnect();
			}
		}
	},
);

const hydratedObserver = new MutationObserver(
	(mutationsList: MutationRecord[]) => {
		for (const mutation of mutationsList) {
			if (mutation.type !== "attributes") continue;

			if (mutation.attributeName === "hydrated") {
				console.log(
					"should not observe mutations, just inject elements right away",
				);
				const scrollablePage = document.getElementById("scrollable-page");

				if (scrollablePage) {
					console.log("adding draggable app region");
					document.querySelector(".app-container")?.prepend(DragRegion());
					injectedElements.scrollablePage = true;
				}

				const navigationHeader =
					document.getElementsByClassName("navigation__header")[0];

				if (navigationHeader) {
					console.log("found navigation header", navigationHeader.parentNode);
					navigationHeader.parentNode?.prepend(NavHeader());
					injectedElements.navigationHeader = true;
				}
				hydratedObserver.disconnect();
			}
		}
	},
);

document.addEventListener("DOMContentLoaded", () => {
	const styleElement = document.createElement("style");
	if (!isClassical()) {
		styleElement.innerText = styleFixtures + "\n\n" + liquidFixtures;
	} else {
		styleElement.innerText = styleFixtures + "\n\n" + classicalFixtures;
	}
	document.head.appendChild(styleElement);

	if (shouldObserveChildMutations()) {
		const bodyContainer = document.getElementsByClassName("body-container")[0];

		childObserver.observe(bodyContainer, {
			childList: true,
			subtree: true,
		});
	} else {
		hydratedObserver.observe(document.documentElement, {
			attributes: true,
		});
	}
});

noopSentry();
proxyMusicKit();
