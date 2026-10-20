const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const heroMedia = document.querySelector('[data-parallax]');
if (heroMedia && !prefersReducedMotion) {
  const handleParallax = () => {
    const offset = Math.min(window.scrollY * 0.12, 90);
    heroMedia.style.transform = `translate3d(0, ${offset}px, 0)`;
  };
  window.addEventListener('scroll', handleParallax, { passive: true });
}

const notice = document.querySelector('.site-notice');
let noticeTimer;
const showNotice = (message) => {
  if (!notice) return;
  notice.textContent = message;
  notice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('show'), 3200);
};

const closePriceMenus = (except = null) => {
  document.querySelectorAll('.price-options:not([hidden])').forEach((panel) => {
    if (panel === except) return;
    panel.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${panel.id}"]`);
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.parentElement?.classList.remove('price-menu-open');
  });
};

document.querySelectorAll('.choose-button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    const willOpen = panel.hidden;
    closePriceMenus(panel);
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    button.parentElement?.classList.toggle('price-menu-open', willOpen);
  });
});

document.querySelectorAll('.price-option').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const count = document.querySelector('.bag-count');
    const current = Number(count?.textContent.replace(/[^0-9]/g, '') || 0) + 1;
    if (count) count.textContent = `(${current})`;
    showNotice(`${button.dataset.product} · ${button.dataset.size} · ${button.dataset.price} added to your ritual bag.`);
    const panel = button.closest('.price-options');
    const trigger = panel && document.querySelector(`[aria-controls="${panel.id}"]`);
    if (panel && trigger) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.parentElement?.classList.remove('price-menu-open');
    }
  });
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.product-card')) closePriceMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePriceMenus();
});

document.querySelector('.text-button')?.addEventListener('click', (event) => showNotice(event.currentTarget.dataset.notice));

document.querySelector('#newsletter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#email');
  const message = document.querySelector('.form-message');
  if (message) message.textContent = `You're on the list — see you in the ritual.`;
  if (input) input.value = '';
});

const menuToggle = document.querySelector('.menu-toggle');
const header = document.querySelector('.site-header');
menuToggle?.addEventListener('click', () => {
  const isOpen = header.classList.toggle('menu-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
document.querySelectorAll('.desktop-nav a').forEach((link) => link.addEventListener('click', () => {
  header.classList.remove('menu-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));
