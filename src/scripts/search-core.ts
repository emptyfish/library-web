// Client-side search over /search-index.json (built at build time). Loaded on first use.
import MiniSearch from 'minisearch';
import { url } from '../lib/url';

export { url };

export interface BookHit {
  kind: 'book';
  id: string;
  title: string;
  author: string;
  slug: string;
  authorSlug: string;
  year?: string;
  cover?: string;
  where: string;
  score: number;
}

export interface AuthorHit {
  kind: 'author';
  id: string;
  title: string; // author name
  slug: string;
  count: number;
  score: number;
}

export type Hit = BookHit | AuthorHit;

let ready: Promise<MiniSearch<Hit>> | null = null;

export function loadIndex(): Promise<MiniSearch<Hit>> {
  ready ??= fetch(url('/search-index.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`Search index failed to load (${r.status})`);
      return r.json();
    })
    .then((docs: Record<string, unknown>[]) => {
      const ms = new MiniSearch<Hit>({
        fields: ['title', 'author', 'publisher', 'notes', 'keywords'],
        storeFields: ['kind', 'title', 'author', 'slug', 'authorSlug', 'year', 'cover', 'where', 'count'],
        searchOptions: {
          boost: { title: 3, author: 2.5, publisher: 1, notes: 1, keywords: 0.5 },
          prefix: true,
          fuzzy: (term) => (term.length > 5 ? 0.2 : false),
          combineWith: 'AND',
        },
      });
      ms.addAll(docs as unknown as Hit[]);
      return ms;
    })
    .catch((err) => {
      ready = null; // allow a retry
      throw err;
    });
  return ready;
}

export async function search(query: string): Promise<{ books: BookHit[]; authors: AuthorHit[] }> {
  const q = query.trim();
  if (q.length < 2) return { books: [], authors: [] };
  const ms = await loadIndex();
  const hits = ms.search(q) as unknown as Hit[];
  return {
    books: hits.filter((h): h is BookHit => h.kind === 'book'),
    authors: hits.filter((h): h is AuthorHit => h.kind === 'author'),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Wrap query terms found in text with <mark>. Input is plain text; output is safe HTML. */
export function highlight(text: string, query: string): string {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return escapeHtml(text);
  // Split on matches first, then escape each piece, so markup never lands inside an entity.
  return text
    .split(new RegExp(`(${terms.join('|')})`, 'gi'))
    .map((part, i) => (i % 2 ? `<mark class="bg-transparent font-semibold text-accent">${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}
