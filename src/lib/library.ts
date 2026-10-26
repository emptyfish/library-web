// Build-time data layer. Reads the archived MongoDB export in /data and shapes it for the pages.
// The raw files are the only surviving copy of the catalog, so they are never modified here.
import type { ImageMetadata } from 'astro';
import rawBooks from '../../data/books.json';
import rawLayout from '../../data/shelves.json';
import shelfPhotoInfo from '../data/shelf-photos.json';
import { url } from './url';

// ---------- Types ----------

export interface Book {
  id: number;
  title: string;
  slug: string;
  author: string;
  authorSlug: string;
  location: Location;
  isSigned: boolean;
  isCollection: boolean;
  volume: string | null;
  notes: string | null;
  goodreads: {
    matched: boolean;
    link: string | null;
    rating: number | null;
    ratingCount: number | null;
  };
  isbn: string | null;
  isbn13: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  pages: number | null;
  publishYear: number | null;
  publisher: string | null;
  format: string | null;
  cover: string | null;
  coverSmall: string | null;
}

export interface Location {
  group: string;
  groupSlug: string;
  caseId: string;
  caseName: string;
  shelfId: string;
}

export interface ShelfAuthor {
  name: string;
  slug: string;
  count: number;
}

export interface ShelfPhoto {
  image: ImageMetadata;
  alt: string;
}

export interface Shelf {
  id: string;
  position: string | null; // e.g. "Top shelf"
  books: Book[];
  authors: ShelfAuthor[];
  photo: ShelfPhoto | null;
}

export interface Bookcase {
  id: string;
  name: string;
  shelves: Shelf[];
  totalBooks: number;
}

export interface Group {
  name: string;
  slug: string;
  bookcases: Bookcase[];
  totalBooks: number;
  totalAuthors: number;
  totalShelves: number;
}

export interface Author {
  name: string;
  slug: string;
  sortName: string;
  books: Book[];
}

// ---------- Raw record cleanup ----------

type Raw = Record<string, any>;

const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'blockquote']);

/** Keep simple formatting tags from Goodreads descriptions; drop everything else (and all attributes). */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g, (_m, slash: string, tag: string) => {
      const t = tag.toLowerCase();
      if (t === 'div') return slash ? '</p>' : '<p>';
      return ALLOWED_TAGS.has(t) ? `<${slash}${t}>` : '';
    })
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ratings exported from Mongo can be NaN ({"$numberDouble": "NaN"}); treat those as missing. */
function toNumber(v: unknown): number | null {
  if (v && typeof v === 'object' && '$numberDouble' in (v as Raw)) v = Number((v as Raw).$numberDouble);
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const layout = rawLayout as Raw[];
const caseNames = new Map<string, string>();
for (const g of layout) for (const c of g.bookcases) caseNames.set(c.case_id, c.case_name);

function toBook(r: Raw): Book {
  const description = toText(r.gr_description);
  const rating = toNumber(r.gr_rating_average);
  return {
    id: r._id,
    title: toText(r.title) ?? 'Untitled',
    slug: r.title_slug,
    author: toText(r.author_name) ?? 'Unknown author',
    authorSlug: r.author_slug || 'unknown-author',
    location: {
      group: r.group_name,
      groupSlug: slugify(r.group_name),
      caseId: r.case_id,
      caseName: caseNames.get(r.case_id) ?? r.case_name,
      shelfId: r.shelf_id,
    },
    isSigned: r.is_signed === true,
    isCollection: r.is_collection === true,
    volume: toText(r.volume_number),
    notes: toText(r.book_notes),
    goodreads: {
      matched: r.gr_match === true,
      link: toText(r.gr_link),
      rating: rating && rating > 0 ? rating : null,
      ratingCount: toNumber(r.gr_rating_count),
    },
    isbn: toText(r.gr_isbn),
    isbn13: toText(r.gr_isbn13),
    descriptionHtml: description ? sanitizeHtml(description) : null,
    descriptionText: description ? htmlToText(description) : null,
    pages: toNumber(r.gr_page_count),
    publishYear: toNumber(r.gr_publish_year),
    publisher: toText(r.gr_publish_by),
    format: toText(r.gr_format),
    cover: coverAt(r.gr_image_url ?? r.small_image_url, null),
    coverSmall: coverAt(r.gr_image_url ?? r.small_image_url, 240),
  };
}

/** Goodreads URLs carry a size code (e.g. "._SX98_"); swap it for a height, or drop it for full size. */
function coverAt(url: unknown, height: number | null): string | null {
  const u = toText(url);
  if (!u) return null;
  return u.replace(/\._S[XY]\d+_(?=\.\w+$)/, height ? `._SY${height}_` : '');
}

export const books: Book[] = (rawBooks as Raw[]).map(toBook).sort((a, b) => a.id - b.id);
export const bookBySlug = new Map(books.map((b) => [b.slug, b]));

// ---------- Authors ----------

function sortNameFor(name: string): string {
  const parts = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(/\s+/);
  const last = parts.pop() ?? name;
  return `${last}, ${parts.join(' ')}`.toLowerCase();
}

function byYearThenTitle(a: Book, b: Book) {
  const ay = a.publishYear ?? Infinity;
  const by = b.publishYear ?? Infinity;
  return ay - by || a.title.localeCompare(b.title);
}

export const authors: Author[] = (() => {
  const map = new Map<string, Book[]>();
  for (const b of books) {
    if (!map.has(b.authorSlug)) map.set(b.authorSlug, []);
    map.get(b.authorSlug)!.push(b);
  }
  return [...map].map(([slug, list]) => {
    // One slug can carry two spellings (e.g. MacFarlane / Macfarlane): use the most common one.
    const counts = new Map<string, number>();
    for (const b of list) counts.set(b.author, (counts.get(b.author) ?? 0) + 1);
    const name = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    return { name, slug, sortName: sortNameFor(name), books: [...list].sort(byYearThenTitle) };
  });
})();

export const authorBySlug = new Map(authors.map((a) => [a.slug, a]));

export const topAuthors = [...authors]
  .sort((a, b) => b.books.length - a.books.length || a.sortName.localeCompare(b.sortName))
  .slice(0, 10);

// ---------- Shelf photos ----------

const photoFiles = import.meta.glob<ImageMetadata>('../assets/shelves/*.jpg', {
  eager: true,
  import: 'default',
});
const photoById = new Map<string, ImageMetadata>();
for (const [file, image] of Object.entries(photoFiles)) {
  photoById.set(file.split('/').pop()!.replace('.jpg', ''), image);
}
const positionById = new Map<string, string>(
  (shelfPhotoInfo as Raw[]).map((s) => [s.shelf_id, s.alternateText]),
);

// ---------- Groups → bookcases → shelves ----------

function shelfAuthors(list: Book[]): ShelfAuthor[] {
  const map = new Map<string, ShelfAuthor>();
  for (const b of list) {
    const a = map.get(b.authorSlug) ?? {
      name: authorBySlug.get(b.authorSlug)?.name ?? b.author,
      slug: b.authorSlug,
      count: 0,
    };
    a.count++;
    map.set(b.authorSlug, a);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const groups: Group[] = layout.map((g) => {
  const groupBooks = books.filter((b) => b.location.group === g.group_name);
  const bookcases: Bookcase[] = [...g.bookcases]
    .sort((a: Raw, b: Raw) => a.case_index - b.case_index)
    .map((c: Raw) => {
      const caseBooks = groupBooks.filter((b) => b.location.caseId === c.case_id);
      // Shelves in layout order, then any shelf that only appears on books (e.g. D9).
      const order: string[] = [...c.shelves]
        .sort((a: Raw, b: Raw) => a.shelf_index - b.shelf_index)
        .map((s: Raw) => s.shelf_id);
      for (const id of [...new Set(caseBooks.map((b) => b.location.shelfId))].sort()) {
        if (!order.includes(id)) order.push(id);
      }
      const shelves: Shelf[] = order
        .map((id) => {
          const list = caseBooks.filter((b) => b.location.shelfId === id);
          const position = positionById.get(id) ?? null;
          const image = photoById.get(id);
          return {
            id,
            position,
            books: list,
            authors: shelfAuthors(list),
            photo: image
              ? {
                  image,
                  alt: `Photo of shelf ${id} in the ${c.case_name} bookcase at ${g.group_name}${position ? ` (${position.toLowerCase()})` : ''}`,
                }
              : null,
          };
        })
        .filter((s) => s.books.length > 0);
      return { id: c.case_id, name: c.case_name, shelves, totalBooks: caseBooks.length };
    })
    .filter((c) => c.totalBooks > 0);

  return {
    name: g.group_name,
    slug: slugify(g.group_name),
    bookcases,
    totalBooks: groupBooks.length,
    totalAuthors: new Set(groupBooks.map((b) => b.authorSlug)).size,
    totalShelves: bookcases.reduce((n, c) => n + c.shelves.length, 0),
  };
});

const shelfById = new Map<string, Shelf>();
for (const g of groups) for (const c of g.bookcases) for (const s of c.shelves) shelfById.set(s.id, s);

export function getShelf(id: string): Shelf | undefined {
  return shelfById.get(id);
}

// ---------- Summary + ratings (the home page) ----------

const rated = books.filter((b) => b.goodreads.rating !== null);

export const summary = {
  totalBooks: books.length,
  totalAuthors: authors.length,
  totalPages: books.reduce((n, b) => n + (b.pages ?? 0), 0),
  totalRated: rated.length,
  averageRating: rated.reduce((n, b) => n + b.goodreads.rating!, 0) / rated.length,
};

export interface RatingBucket {
  stars: number;
  books: number;
  averageScore: number;
  percent: number;
}

/** Goodreads averages grouped by whole star (4.37 → 4), highest first. */
export const ratingBuckets: RatingBucket[] = (() => {
  const counted = rated.filter((b) => b.goodreads.matched && (b.goodreads.ratingCount ?? 0) > 0);
  const map = new Map<number, number[]>();
  for (const b of counted) {
    const stars = Math.trunc(b.goodreads.rating!);
    if (!map.has(stars)) map.set(stars, []);
    map.get(stars)!.push(b.goodreads.rating!);
  }
  return [...map]
    .sort((a, b) => b[0] - a[0])
    .map(([stars, scores]) => ({
      stars,
      books: scores.length,
      averageScore: scores.reduce((n, s) => n + s, 0) / scores.length,
      percent: scores.length / counted.length,
    }));
})();

// ---------- Display helpers ----------

export function formatYear(year: number | null): string | null {
  if (year === null) return null;
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

export function shelfUrl(loc: Location): string {
  return url(`/library/${loc.groupSlug}#shelf-${loc.shelfId}`);
}

const SPINE_COLORS = [
  { bg: '#7a2a20', fg: '#f3e6cf' }, // oxblood
  { bg: '#2e4a36', fg: '#efe6cf' }, // forest
  { bg: '#24324a', fg: '#eee4cf' }, // navy
  { bg: '#9c6a24', fg: '#fbf1dc' }, // ochre
  { bg: '#6b3d24', fg: '#f3e6cf' }, // chestnut
  { bg: '#46525c', fg: '#eef0ec' }, // slate
  { bg: '#4d2c3d', fg: '#f1e2e6' }, // plum
  { bg: '#5b5826', fg: '#f4efd4' }, // olive
  { bg: '#2a5352', fg: '#e7f0ec' }, // teal
  { bg: '#d8c8a8', fg: '#3a2a1c' }, // cream
];

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Stable, book-like spine dimensions and colors derived from the book's id, format and length. */
export function spineStyle(b: Book) {
  const h = hash(b.id);
  const color = SPINE_COLORS[h % SPINE_COLORS.length];
  const pages = b.pages ?? 260;
  const width = Math.round(Math.min(46, Math.max(20, 14 + pages / 22)));
  const fmt = (b.format ?? '').toLowerCase();
  const base = fmt.includes('hard') ? 168 : fmt.includes('mass market') ? 134 : 150;
  const height = base + ((h >>> 8) % 6) * 5;
  const band = (h >>> 4) % 3; // 0: none, 1: gilt bands, 2: label
  return { ...color, width, height, band };
}

/** Fill {books}, {authors}, {pages}, {rated} and {average} in site text. */
export function fillText(text: string): string {
  const values: Record<string, string> = {
    books: summary.totalBooks.toLocaleString('en-US'),
    authors: summary.totalAuthors.toLocaleString('en-US'),
    pages: summary.totalPages.toLocaleString('en-US'),
    rated: summary.totalRated.toLocaleString('en-US'),
    average: summary.averageRating.toFixed(2),
  };
  return text.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}
