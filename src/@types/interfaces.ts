export interface PlayerIntegration {
    shortName: string
    load(): Promise<void> | void
    unload(): Promise<void> | void
}

export interface Artwork {
    width: number;
    height: number;
    url: string;
}

export interface PlayParams {
    id: string;
    kind: string;
    isLibrary: boolean;
    reporting: boolean;
    catalogId: string;
    reportingId: string;
}

export interface TrackMetadata {
    albumName: string;
    discNumber: number;
    genreNames: string[];
    trackNumber: number;
    hasLyrics: boolean;
    releaseDate: string;
    durationInMillis: number;
    name: string;
    contentRating: string;
    artistName: string;
    // so classical!
    attribution: string;
    composerName: string;
    artwork: Artwork;
    playParams: PlayParams;
    isrc: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previews: any[];
    url: string;
}


export interface AppOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}
