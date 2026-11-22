import './page-transition.js';
import './wishlist.js';

const header = document.querySelector('.site-header');
const toggle = header?.querySelector('.menu-toggle');
const menu = header?.querySelector('.site-menu');

function setMenuOpen(open) {
  if (!header || !toggle || !menu) return;
  header.classList.toggle('menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.hidden = !open;
}

toggle?.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'));
header?.querySelectorAll('nav a').forEach((link) => {
  const destination = new URL(link.href);
  if (destination.pathname === location.pathname && destination.search === location.search) {
    link.setAttribute('aria-current', 'page');
  }
});
menu?.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href]')) setMenuOpen(false);
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
window.addEventListener('pageshow', () => setMenuOpen(false));
