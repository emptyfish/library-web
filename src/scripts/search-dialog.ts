// The search pop-up in the header: "/" or Ctrl/⌘+K opens it, arrows move, Enter opens.
import { escapeHtml, highlight, loadIndex, search, url, type AuthorHit, type BookHit } from './search-core';

const dialog = document.getElementById('search-dialog') as HTMLDialogElement | null;
const input = dialog?.querySelector<HTMLInputElement>('[data-search-input]');
const results = dialog?.querySelector<HTMLElement>('[data-search-results]');
const form = dialog?.querySelector<HTMLFormElement>('[data-search-form]');

const MAX_BOOKS = 8;
let active = -1;
let seq = 0;
const initialMessage = results?.innerHTML ?? '';

function open() {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input?.select();
  loadIndex().catch(() => {}); // warm up
}

function bookRow(b: BookHit, q: string) {
  const meta = [b.year, b.where].filter(Boolean).map((s) => escapeHtml(s!)).join(' · ');
  const cover = b.cover
    ? `<img src="${escapeHtml(b.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="h-12 w-8 shrink-0 rounded-[2px] object-cover shadow" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'block h-12 w-8 shrink-0 rounded-[2px] bg-paper-2'}))">`
    : `<span class="block h-12 w-8 shrink-0 rounded-[2px] bg-paper-2"></span>`;
  return `<li><a href="${url(`/books/${escapeHtml(b.slug)}`)}" data-hit class="flex items-center gap-3 px-4 py-2.5 hover:bg-paper-2 aria-selected:bg-paper-2">
    ${cover}
    <span class="min-w-0">
      <span class="block truncate font-display text-[1.05rem] text-ink">${highlight(b.title, q)}</span>
      <span class="block truncate font-sans text-sm text-ink-2">${highlight(b.author, q)}</span>
      <span class="block truncate font-sans text-xs text-ink-3">${meta}</span>
    </span>
  </a></li>`;
}

function authorRow(a: AuthorHit, q: string) {
  return `<li><a href="${url(`/author/${escapeHtml(a.slug)}`)}" data-hit class="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-paper-2 aria-selected:bg-paper-2">
    <span class="truncate font-display text-[1.05rem]">${highlight(a.title, q)}</span>
    <span class="chip shrink-0">${a.count} book${a.count === 1 ? '' : 's'}</span>
  </a></li>`;
}

async function render(q: string) {
  if (!results) return;
  const mine = ++seq;
  active = -1;
  if (q.trim().length < 2) {
    results.innerHTML = initialMessage;
    return;
  }
  let found: Awaited<ReturnType<typeof search>>;
  try {
    found = await search(q);
  } catch {
    results.innerHTML = `<p class="px-5 py-8 text-center font-sans text-sm text-ink-3">Search couldn't load. Check your connection and try again.</p>`;
    return;
  }
  if (mine !== seq) return; // a newer query is already rendering

  const { books, authors } = found;
  if (!books.length && !authors.length) {
    results.innerHTML = `<p class="px-5 py-8 text-center font-sans text-sm text-ink-3">Nothing on the shelves matches “${escapeHtml(q)}”.</p>`;
    return;
  }
  const parts: string[] = [];
  if (authors.length) {
    parts.push(`<p class="eyebrow px-4 pt-3 pb-1">Authors</p><ul>${authors.slice(0, 3).map((a) => authorRow(a, q)).join('')}</ul>`);
  }
  if (books.length) {
    parts.push(`<p class="eyebrow px-4 pt-3 pb-1">Books</p><ul>${books.slice(0, MAX_BOOKS).map((b) => bookRow(b, q)).join('')}</ul>`);
  }
  const more = books.length > MAX_BOOKS ? `See all ${books.length} matching books` : 'Show results page';
  parts.push(
    `<a href="${url(`/search?q=${encodeURIComponent(q)}`)}" data-hit class="flex items-center justify-between border-t border-line px-4 py-3 font-sans text-sm font-medium text-accent hover:bg-paper-2 aria-selected:bg-paper-2">${more}<span aria-hidden="true">→</span></a>`,
  );
  results.innerHTML = parts.join('');
}

function move(delta: number) {
  const hits = [...(results?.querySelectorAll<HTMLAnchorElement>('[data-hit]') ?? [])];
  if (!hits.length) return;
  hits[active]?.removeAttribute('aria-selected');
  active = (active + delta + hits.length) % hits.length;
  hits[active].setAttribute('aria-selected', 'true');
  hits[active].scrollIntoView({ block: 'nearest' });
}

if (dialog && input && results && form) {
  document.querySelectorAll('[data-open-search]').forEach((b) => b.addEventListener('click', open));
  dialog.querySelector('[data-close-search]')?.addEventListener('click', () => dialog.close());

  document.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      open();
    }
  });

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
  });

  form.addEventListener('submit', (e) => {
    const selected = results.querySelector<HTMLAnchorElement>('[data-hit][aria-selected="true"]');
    if (selected) {
      e.preventDefault();
      location.href = selected.href;
    } else if (input.value.trim().length < 2) {
      e.preventDefault();
    }
  });
}
