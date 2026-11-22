const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const nativePageTransitions = 'onpageswap' in window && 'onpagereveal' in window;
const storageKey = 'sheabliss-navigation-fade';
let navigating = false;
let veil;

function resetNavigation() {
  navigating = false;
  veil?.remove();
  veil = undefined;
}

function createVeil() {
  veil?.remove();
  veil = document.createElement('div');
  veil.className = 'navigation-veil';
  veil.setAttribute('aria-hidden', 'true');
  document.body.append(veil);
  return veil;
}

if (!nativePageTransitions && !reducedMotion.matches) {
  let incoming = false;
  try {
    incoming = sessionStorage.getItem(storageKey) === 'true';
    sessionStorage.removeItem(storageKey);
  } catch { /* Navigation remains usable when storage is unavailable. */ }
  if (incoming) {
    const overlay = createVeil();
    overlay.classList.add('is-covering');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.remove('is-covering');
      window.setTimeout(() => {
        if (veil === overlay && !navigating) resetNavigation();
      }, 220);
    }));
  }
}

// Preserve normal browser navigation in browsers supporting cross-document transitions.
// The fallback intercepts only ordinary same-origin page clicks, never payments or anchors.
if (!nativePageTransitions) {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.closest('.site-menu') || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !['http:', 'https:'].includes(destination.protocol)) return;
    if (destination.pathname === location.pathname && destination.search === location.search) return;
    if (reducedMotion.matches || event.detail === 0) return;
    event.preventDefault();
    if (navigating) return;
    navigating = true;
    try { sessionStorage.setItem(storageKey, 'true'); } catch { /* No incoming animation without storage. */ }
    const overlay = createVeil();
    overlay.getBoundingClientRect();
    overlay.classList.add('is-covering');
    window.setTimeout(() => location.assign(destination.href), 180);
  });
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) resetNavigation();
});
