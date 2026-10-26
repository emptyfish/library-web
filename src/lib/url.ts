// Every internal link goes through url() so the site works both at a domain root
// and under a sub-path (e.g. GitHub Pages at /library-web/). The base comes from astro.config.mjs.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

export function url(path: string): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The base path without a trailing slash ('' at a domain root). */
export const basePath = base;
