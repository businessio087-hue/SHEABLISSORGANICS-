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

const cart = [];
const checkoutModal = document.querySelector('#checkout-modal');
const checkoutItems = document.querySelector('#checkout-items');
const checkoutTotal = document.querySelector('#checkout-total');
const bagCount = document.querySelector('.bag-count');
const checkoutForm = document.querySelector('#checkout-form');
const checkoutMessage = document.querySelector('.checkout-message');

const moneyValue = (price) => Number(String(price).replace(/[^0-9]/g, '')) || 0;
const formatMoney = (amount) => `R${amount.toLocaleString('en-ZA')}`;
const updateBagCount = () => {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  if (bagCount) bagCount.textContent = `(${count})`;
};
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
checkoutForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!cart.length) {
    if (checkoutMessage) checkoutMessage.textContent = 'Choose a product size before finalising your purchase.';
    return;
  }
  if (checkoutMessage) checkoutMessage.textContent = 'Your order details are ready. Yoco payment handoff will activate when the payment connection is enabled.';
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

document.addEventListener('click', (event) => {
  if (!event.target.closest('.product-card')) closePriceMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (checkoutModal && !checkoutModal.hidden) closeCheckout();
    closePriceMenus();
  }
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
