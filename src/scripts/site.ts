// Site-wide behavior: theme toggle, mobile menu, shelf photo pop-ups.

// Theme toggle
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      /* private mode: the choice just won't persist */
    }
  });
});

// Mobile menu
const menu = document.querySelector<HTMLElement>('[data-menu]');
document.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const open = menu?.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', String(open));
  });
});

// Any <dialog> closes when its backdrop is clicked.
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof HTMLDialogElement && t.open) t.close();
});

// Shelf photo pop-ups: <button data-open-photo="A3"> opens <dialog data-photo-dialog="A3">.
document.addEventListener('click', (e) => {
  const trigger = (e.target as Element).closest<HTMLElement>('[data-open-photo]');
  if (!trigger) return;
  const id = trigger.dataset.openPhoto!;
  const dialog = document.querySelector<HTMLDialogElement>(`[data-photo-dialog="${CSS.escape(id)}"]`);
  if (!dialog) return;
  e.preventDefault();
  dialog.showModal();
  window.libTrack('shelfView', id);
});
