interface ImportMetaEnv {
  readonly PUBLIC_MATOMO_URL?: string;
  readonly PUBLIC_MATOMO_SITE_ID?: string;
}

interface Window {
  _paq: unknown[][];
  libTrack: (category: string, action: string, name?: string) => void;
}
