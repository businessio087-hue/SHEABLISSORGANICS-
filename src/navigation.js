import './page-transition.js';
import './wishlist.js';

const header = document.querySelector('.site-header');
const toggle = header?.querySelector('.menu-toggle');
const menu = header?.querySelector('.site-menu');

function addHeaderSearch() {
  if (!header || header.querySelector('.header-search')) return;
  const form = document.createElement('form');
  form.className = 'header-search';
  form.setAttribute('role', 'search');
  form.action = '/shop/';
  form.method = 'get';
  form.innerHTML = '<label class="sr-only" for="header-search-input">Search SheaBliss products</label><input id="header-search-input" name="q" type="search" placeholder="Search rituals" autocomplete="off" /><button type="submit" aria-label="Submit search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"></circle><path d="m16 16 4.5 4.5"></path></svg></button>';
  const actions = header.querySelector('.header-actions');
  header.insertBefore(form, actions || menu || null);
  const query = new URLSearchParams(window.location.search).get('q')?.trim();
  if (query) form.elements.q.value = query;
}

addHeaderSearch();

function setMenuOpen(open) {
  if (!header || !toggle || !menu) return;
  header.classList.toggle('menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.hidden = !open;
}

toggle?.addEventListener('click', () => setMenuOpen(menu?.hidden === true));
header?.querySelectorAll('nav a').forEach((link) => {
  const destination = new URL(link.href);
  if (destination.pathname === location.pathname && destination.search === location.search) {
    link.setAttribute('aria-current', 'page');
  }
  link.addEventListener('click', () => setMenuOpen(false));
});

document.addEventListener('click', (event) => {
  if (event.target instanceof Node && !header?.contains(event.target)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu && !menu.hidden) {
    setMenuOpen(false);
    toggle?.focus();
  }
});
header?.addEventListener('focusout', () => {
  queueMicrotask(() => {
    if (!header.contains(document.activeElement)) setMenuOpen(false);
  });
});
window.addEventListener('pageshow', () => setMenuOpen(false));
