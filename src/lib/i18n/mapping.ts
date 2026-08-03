export const storefrontMapping = {
	BR: {
		preferredLanguage: "pt-BR",
		languages: ["pt-BR"],
	},
};

export function isKnownStorefront(
	id: string,
): id is keyof typeof storefrontMapping {
	return id in storefrontMapping;
}
