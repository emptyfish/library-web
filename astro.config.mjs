// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// The deploy workflow sets these from the GitHub Pages settings:
//   SITE_URL  e.g. https://emptyfish.github.io (or a custom domain)
//   BASE_PATH e.g. /library-web ('' or unset when served from a domain root)
// Locally both are unset, so the site runs at http://localhost:4321/.
const site = process.env.SITE_URL || undefined;
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss()] },
});
