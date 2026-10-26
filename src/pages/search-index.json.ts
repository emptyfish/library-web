// Search documents for the client-side search (see src/scripts/search-core.ts).
// Descriptions are reduced to a set of distinct keywords to keep the file small.
import { authors, books, formatYear } from '../lib/library';

const STOP = new Set(
  'about above after again against also among another around because been before being below between both came come could does doing down during each even every from further have having here into itself just like made make many more most much must never only other over same should since some such than that their them then there these they this those through under until upon very were what when where which while whom will with within without would your yours book books novel story stories author edition readers reader first last life time years world into'.split(
    ' ',
  ),
);

const MAX_KEYWORDS = 30;

function words(text: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const w of text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9']+/)) {
    const word = w.replace(/^'+|'+$/g, '').replace(/'s$/, '');
    if (word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word)) out.add(word);
  }
  return [...out];
}

// How many descriptions each word appears in; rarer words say more about a book.
const bookWords = new Map(books.map((b) => [b.id, words(b.descriptionText)]));
const docFreq = new Map<string, number>();
for (const list of bookWords.values()) for (const w of list) docFreq.set(w, (docFreq.get(w) ?? 0) + 1);

/** The most distinctive words of a description (skipping words common across the catalog). */
function keywords(id: number): string {
  return (bookWords.get(id) ?? [])
    .filter((w) => docFreq.get(w)! <= 25)
    .sort((a, b) => docFreq.get(a)! - docFreq.get(b)! || b.length - a.length)
    .slice(0, MAX_KEYWORDS)
    .join(' ');
}

export function GET() {
  const docs = [
    ...books.map((b) => ({
      id: `b${b.id}`,
      kind: 'book',
      title: b.title,
      author: b.author,
      slug: b.slug,
      authorSlug: b.authorSlug,
      year: formatYear(b.publishYear) ?? undefined,
      cover: b.coverSmall ?? undefined,
      where: `${b.location.group}, shelf ${b.location.shelfId}`,
      publisher: b.publisher ?? undefined,
      notes: b.notes ?? undefined,
      keywords: keywords(b.id) || undefined,
    })),
    ...authors.map((a) => ({
      id: `a-${a.slug}`,
      kind: 'author',
      title: a.name,
      slug: a.slug,
      count: a.books.length,
    })),
  ];
  return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
}
