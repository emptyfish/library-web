# The Library

A static archive of 1,022 books, organized the way they were shelved: **location → bookcase → shelf**.
Book details and covers come from Goodreads, from a snapshot taken in 2019.

The site is plain HTML generated at build time with [Astro](https://astro.build). There's no server or database.

## Data

| File | What it is |
| --- | --- |
| `data/books.json` | Every book, exported from the original MongoDB `library.books` collection. **This is the only surviving copy of the catalog, so don't edit it by hand.** |
| `data/shelves.json` | The layout of each location's bookcases and shelves (`library.shelves`). |
| `src/data/shelf-photos.json` | Position labels for each shelf photo ("Top shelf", …). |
| `src/assets/shelves/*.jpg` | Shelf photos, named by shelf id. The build makes resized WebP copies. |

Some fields (`original_owner`, `date_entered`, `category`) are kept in the archive but aren't used by the site.
All data shaping (stats, ratings, groupings, cleanup of odd values) happens in [`src/lib/library.ts`](src/lib/library.ts).

## Develop

Requires Node 22.12 or newer.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # writes the static site to dist/
npm run preview   # serve dist/ locally
npm run check     # type-check
```

## Pages

- `/`: collection stats, Goodreads rating spread, top authors
- `/library/pleasant-street`, `/library/garden`: bookcases as tabs, shelves as book spines, shelf photos. Link straight to a shelf with `#shelf-A3` or a bookcase with `#case-A`.
- `/books/<slug>`: book details, where it sat, its neighbors on the shelf, more by the author
- `/author/<slug>` and `/authors`: per-author list and A–Z index
- `/books/random`: jumps to a random book
- `/search?q=`: full search results. The header search (press `/`) runs in the browser using `/search-index.json`, which is built along with the site.

## Editing the wording

All home-page and footer text, plus the site name, lives in [`src/site-text.ts`](src/site-text.ts).
Change a line, or set it to `''` to hide it. Placeholders like `{books}` and `{authors}` are filled in automatically.

## Analytics (optional)

Matomo page views and events (`bookDetail`, `shelfView`, `random`, site search) are sent when these are set at build time:

```bash
PUBLIC_MATOMO_URL=https://matomo.example.com
PUBLIC_MATOMO_SITE_ID=1
```

Locally, put them in a `.env` file. For GitHub Pages, add repository **variables** (not secrets) named `MATOMO_URL` and `MATOMO_SITE_ID`
under Settings → Secrets and variables → Actions → Variables. Tracking is cookieless.

## Deploy (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes the site on every push to `main`. It can also be run by hand from the Actions tab.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow reads the site address from the Pages settings, so the same code works at
`https://emptyfish.github.io/library-web/` or at a custom domain. All internal links go through `url()` in
[`src/lib/url.ts`](src/lib/url.ts) for this reason, so use it for any new link.

Old links like `/library/Pleasant%20Street` and `/library/Garden` are forwarded to the new addresses by the 404 page.

To try the sub-path build locally:

```bash
BASE_PATH=/library-web npm run build && BASE_PATH=/library-web npm run preview
# then open http://localhost:4321/library-web/
```
