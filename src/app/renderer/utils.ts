export const isClassical = () => window.location.hostname.includes("classical");
export const isPodcasts = () => window.location.hostname.includes("podcasts");

export const shouldObserveChildMutations = () =>
	!isClassical() && !isPodcasts();
