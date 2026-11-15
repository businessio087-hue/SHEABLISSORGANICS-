import './navigation.js';
import { readBag, saveBag } from './cart-storage.js';
import { getCustomerSession } from './customer-session.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const finishPreloader = () => {
  document.body.classList.remove('is-loading');
  document.body.classList.add('page-ready');
  window.setTimeout(() => document.querySelector('#preloader')?.remove(), prefersReducedMotion ? 40 : 980);
};
if (document.readyState === 'complete') finishPreloader();
else window.addEventListener('load', finishPreloader, { once: true });

const cookieConsent = document.querySelector('#cookie-consent');
const acceptCookies = document.querySelector('#accept-cookies');
const cookieConsentKey = 'sheabliss-cookies-accepted';
try {
  if (cookieConsent && window.localStorage.getItem(cookieConsentKey) !== 'true') cookieConsent.hidden = false;
} catch {
  if (cookieConsent) cookieConsent.hidden = false;
}
acceptCookies?.addEventListener('click', () => {
  try { window.localStorage.setItem(cookieConsentKey, 'true'); } catch { /* consent still applies for this view */ }
  if (cookieConsent) cookieConsent.hidden = true;
});

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

const cart = readBag();
const checkoutModal = document.querySelector('#checkout-modal');
const checkoutItems = document.querySelector('#checkout-items');
const checkoutTotal = document.querySelector('#checkout-total');
const bagCount = document.querySelector('.bag-count');
const checkoutForm = document.querySelector('#checkout-form');
const checkoutMessage = document.querySelector('.checkout-message');
const checkoutSubmit = checkoutForm?.querySelector('.checkout-submit');
const accountFilledFields = new Map();
function clearAccountFilledFields(owner = null) {
  for (const [field, saved] of accountFilledFields) {
    if (saved.owner === owner) continue;
    if (field.value === saved.value) field.value = '';
    accountFilledFields.delete(field);
  }
}
document.addEventListener('customer-session-changed', (event) => {
  const current = event.detail;
  clearAccountFilledFields(current.authenticated && current.registered ? current.user?.id : null);
});

const moneyValue = (price) => Number(String(price).replace(/[^0-9]/g, '')) || 0;
const formatMoney = (amount) => `R${amount.toLocaleString('en-ZA')}`;
const updateBagCount = () => {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  if (bagCount) bagCount.textContent = `(${count})`;
  saveBag(cart);
};
updateBagCount();
const renderCart = () => {
  if (!checkoutItems || !checkoutTotal) return;
  if (!cart.length) {
    checkoutItems.innerHTML = '<p class="empty-bag">Your bag is quiet for now. Choose a size from the shop to begin.</p>';
    checkoutTotal.textContent = 'R0';
    updateBagCount();
    return;
  }
  checkoutItems.innerHTML = cart.map((item, index) => `<div class="checkout-item" data-cart-index="${index}">
    <p class="checkout-item-name">${item.product}<small>${item.size} · ${item.price}</small></p>
    <div class="checkout-quantity" aria-label="Quantity for ${item.product} ${item.size}"><button type="button" data-cart-action="decrease" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-cart-action="increase" aria-label="Increase quantity">+</button></div>
    <button class="checkout-remove" type="button" data-cart-action="remove">Remove</button>
  </div>`).join('');
  const total = cart.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  checkoutTotal.textContent = formatMoney(total);
  updateBagCount();
};
const openCheckout = () => {
  renderCart();
  if (!checkoutModal) return;
  checkoutModal.hidden = false;
  document.body.classList.add('checkout-open');
  document.querySelector('#bag-button')?.setAttribute('aria-expanded', 'true');
  checkoutModal.querySelector('.checkout-close')?.focus();
  getCustomerSession(true).then((current) => {
    if (!current.authenticated || !current.registered || !current.user || !checkoutForm || checkoutModal.hidden) return;
    const details = { name: current.user.name, email: current.user.email, phone: current.user.phone, ...(current.user.address || {}) };
    for (const [name, value] of Object.entries(details)) {
      const field = checkoutForm.elements.namedItem(name);
      if (field && !field.value && value) {
        field.value = value;
        accountFilledFields.set(field, { value, owner: current.user.id });
      }
    }
  }).catch(() => { clearAccountFilledFields(); /* Manually entered guest details remain available. */ });
};
const closeCheckout = () => {
  if (!checkoutModal) return;
  checkoutModal.hidden = true;
  document.body.classList.remove('checkout-open');
  document.querySelector('#bag-button')?.setAttribute('aria-expanded', 'false');
};

document.querySelector('#bag-button')?.addEventListener('click', openCheckout);
document.querySelectorAll('[data-close-checkout]').forEach((element) => element.addEventListener('click', closeCheckout));
checkoutItems?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-cart-action]')?.dataset.cartAction;
  const row = event.target.closest('[data-cart-index]');
  if (!action || !row) return;
  const index = Number(row.dataset.cartIndex);
  const item = cart[index];
  if (!item) return;
  if (action === 'increase') item.quantity += 1;
  if (action === 'decrease') item.quantity -= 1;
  if (action === 'remove' || item.quantity <= 0) cart.splice(index, 1);
  renderCart();
});
checkoutForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cart.length) {
    if (checkoutMessage) checkoutMessage.textContent = 'Choose a product size before finalising your purchase.';
    return;
  }
  const formData = new FormData(checkoutForm);
  const addressDetails = {
    streetAddress: formData.get('streetAddress'),
    suburb: formData.get('suburb'),
    postalCode: formData.get('postalCode'),
    buildingType: formData.get('buildingType'),
    companyName: formData.get('companyName'),
  };
  const customer = {
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    ...addressDetails,
    address: [
      addressDetails.companyName,
      addressDetails.buildingType,
      addressDetails.streetAddress,
      `${addressDetails.suburb}, ${addressDetails.postalCode}`,
    ].filter(Boolean).join('\n'),
  };
  if (checkoutSubmit) {
    checkoutSubmit.disabled = true;
    checkoutSubmit.classList.add('is-loading');
  }
  if (checkoutMessage) checkoutMessage.textContent = 'Opening secure Yoco checkout…';
  try {
    const response = await fetch('/api/yoco/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        origin: window.location.origin,
        items: cart.map(({ product, size, quantity }) => ({ product, size, quantity })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.redirectUrl) throw new Error(result.error || 'Yoco checkout could not be started.');
    window.location.assign(result.redirectUrl);
  } catch (error) {
    if (checkoutMessage) checkoutMessage.textContent = error.message;
    if (checkoutSubmit) {
      checkoutSubmit.disabled = false;
      checkoutSubmit.classList.remove('is-loading');
    }
  }
});

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
    const existing = cart.find((item) => item.product === button.dataset.product && item.size === button.dataset.size && item.price === button.dataset.price);
    if (existing) existing.quantity += 1;
    else cart.push({ product: button.dataset.product, size: button.dataset.size, price: button.dataset.price, amount: moneyValue(button.dataset.price), quantity: 1 });
    updateBagCount();
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

const addBagItem = (button) => {
  const existing = cart.find((item) => item.product === button.dataset.product && item.size === button.dataset.size && item.price === button.dataset.price);
  if (existing) existing.quantity += 1;
  else cart.push({ product: button.dataset.product, size: button.dataset.size, price: button.dataset.price, amount: moneyValue(button.dataset.price), quantity: 1 });
  updateBagCount();
  showNotice(`${button.dataset.product} · ${button.dataset.size} · ${button.dataset.price} added to your ritual bag.`);
};

document.querySelectorAll('.add-to-bag-card').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  addBagItem(button);
}));

const productsCarousel = document.querySelector('.products-grid');
if (productsCarousel) {
  let dragging = false; let moved = false; let startX = 0; let startScroll = 0;
  productsCarousel.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    dragging = true; moved = false; startX = event.clientX; startScroll = productsCarousel.scrollLeft;
    productsCarousel.setPointerCapture?.(event.pointerId); productsCarousel.classList.add('is-dragging');
  });
  productsCarousel.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5) moved = true;
    productsCarousel.scrollLeft = startScroll - distance;
  });
  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false; productsCarousel.releasePointerCapture?.(event.pointerId); productsCarousel.classList.remove('is-dragging');
  };
  productsCarousel.addEventListener('pointerup', stopDragging);
  productsCarousel.addEventListener('pointercancel', stopDragging);
  productsCarousel.addEventListener('click', (event) => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.product-card')) closePriceMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (checkoutModal && !checkoutModal.hidden) closeCheckout();
    closePriceMenus();
  }
});

document.querySelector('#newsletter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#email');
  const message = document.querySelector('.form-message');
  if (message) message.textContent = `You're on the list — see you in the ritual.`;
  if (input) input.value = '';
});

if (new URLSearchParams(location.search).get('bag') === 'open') openCheckout();

window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  cart.splice(0, cart.length, ...readBag());
  renderCart();
});

const paymentState = new URLSearchParams(window.location.search).get('payment');
const returnedOrderId = new URLSearchParams(window.location.search).get('order_id');
if (paymentState === 'cancelled') showNotice('Checkout cancelled. Your ritual bag is still here.');
if (paymentState === 'failed') showNotice('Yoco could not complete that payment. Your ritual bag is still here.');
if (paymentState === 'returning' && returnedOrderId) {
  showNotice('Payment return received. We are confirming your order securely.');
  fetch(`/api/yoco/order-status?order_id=${encodeURIComponent(returnedOrderId)}`)
    .then((response) => response.ok ? response.json() : null)
    .then((order) => {
      if (!order) return;
      if (order.status === 'paid') showNotice('Payment confirmed. Your SHEABLISS ritual is being prepared.');
      else if (order.status === 'failed') showNotice('Yoco marked the payment as unsuccessful. Your ritual bag is still here.');
    })
    .catch(() => {});
}
