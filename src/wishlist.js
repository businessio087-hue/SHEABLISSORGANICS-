import { CATALOG, CATEGORY_DEFINITIONS, getProductName, getProductCategories, getProductRange, getStartingPrice, getValidVariants, isPurchasable, getAvailabilityLabel } from '../shared/catalog.mjs';
import { getCustomerSession, accountRequest, escapeHtml, customerSnapshot, isCurrentCustomer } from './customer-session.js';

let savedProducts = new Set();
let pendingWishlist;
let savedRevision = 0;
let activeOwner;
const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const currentItems = () => [...savedProducts].map((product) => ({ product }));

export function heartButton(product) {
  return `<button class="wishlist-heart" type="button" data-wishlist-product="${escapeHtml(product)}" aria-label="Save ${escapeHtml(getProductName(product))} to your wishlist" aria-pressed="false">${heartIcon}</button>`;
}
export function updateHeartButtons() {
  document.querySelectorAll('[data-wishlist-product]').forEach((button) => {
    const selected = savedProducts.has(button.dataset.wishlistProduct);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? 'Remove' : 'Save'} ${getProductName(button.dataset.wishlistProduct)} ${selected ? 'from' : 'to'} your wishlist`);
  });
}

// Shared presentation only: wishlist/API/session storage continue to use item.product.
export function catalogProductCard(item, { index = 0, saved = false, category: contextCategory = null } = {}) {
  const name = getProductName(item);
  const categories = getProductCategories(item).filter((category) => CATEGORY_DEFINITIONS.some((definition) => definition.name === category));
  const primaryCategory = categories.includes(contextCategory) ? contextCategory : categories.includes(item.category) ? item.category : categories[0];
  const productRange = getProductRange(item, primaryCategory);
  const tone = primaryCategory ? primaryCategory.toLowerCase() : 'body';
  const duplicateName = CATALOG.filter((product) => getProductName(product).toLowerCase() === name.toLowerCase()).length > 1;
  const showCode = Boolean(item.code || duplicateName || item.status === 'pending-details');
  const suitableFor = Array.isArray(item.suitableFor) ? item.suitableFor.join(', ') : item.suitableFor;
  const categoryHref = (category, range) => `/category.html?category=${encodeURIComponent(category)}${range ? `&range=${encodeURIComponent(range)}` : ''}`;
  const categoryLinks = categories.map((category) => `<a href="${escapeHtml(categoryHref(category))}">${escapeHtml(category)}</a>`).join(' · ');
  const rangeHref = primaryCategory ? categoryHref(primaryCategory, productRange) : `/shop.html?range=${encodeURIComponent(productRange)}`;
  const startingPrice = getStartingPrice(item);
  // Approval is catalog-owned. Keep the first original variant's price and size together;
  // do not substitute a lowest-priced size, or create variants for pending records.
  const variant = startingPrice !== null && isPurchasable(item)
    ? getValidVariants(item)[0]
    : null;
  const price = variant ? variant.amountZar : startingPrice;
  const bagHref = variant ? `/?bag=open&product=${encodeURIComponent(item.product)}&size=${encodeURIComponent(variant.size)}` : null;
  const priceMarkup = startingPrice !== null
    ? `<strong class="catalog-product-price">R${price.toLocaleString('en-ZA')}${variant ? `<span> / ${escapeHtml(variant.size)}</span>` : ''}</strong>`
    : '';
  return `<article class="${saved ? 'saved-product-card' : 'category-product'} catalog-product-card catalog-product-${escapeHtml(tone)}">
    <div class="catalog-product-head"><span class="catalog-product-kicker">${saved ? 'Saved ritual' : `${String(index + 1).padStart(2, '0')} / SHEABLISS`}</span>${heartButton(item.product)}</div>
    ${showCode ? `<p class="catalog-product-code">SKU ${escapeHtml(item.code || item.product)}</p>` : ''}
    <h2>${escapeHtml(name)}</h2>
    ${item.description ? `<p class="catalog-product-description">${escapeHtml(item.description)}</p>` : ''}
    <dl class="catalog-product-facts">
      <div><dt>Category</dt><dd>${categoryLinks || 'Category being confirmed'}</dd></div>
      <div><dt>Type</dt><dd>${escapeHtml(item.productType || 'Product type being confirmed')}</dd></div>
      ${productRange ? `<div><dt>Range</dt><dd><a href="${escapeHtml(rangeHref)}">${escapeHtml(productRange)}</a></dd></div>` : ''}
      ${item.bodyPart ? `<div><dt>Use area</dt><dd>${escapeHtml(item.bodyPart)}</dd></div>` : ''}
      ${suitableFor ? `<div><dt>Suitable for</dt><dd>${escapeHtml(suitableFor)}</dd></div>` : ''}
    </dl>
    <div class="catalog-product-order">${priceMarkup}<p class="catalog-product-availability">${escapeHtml(getAvailabilityLabel(item))}</p>${bagHref ? `<a class="line-link catalog-product-buy" href="${escapeHtml(bagHref)}">Add to bag</a>` : ''}</div>
  </article>`;
}

function updateAccountLinks(current) {
  const registered = current.authenticated && current.registered;
  const owner = registered ? `${current.user.id}:${customerSnapshot().revision}` : null;
  document.querySelectorAll('[data-account-link]').forEach((link) => {
    link.querySelector('[data-account-label]')?.replaceChildren(registered ? 'Account' : 'Sign in');
    link.setAttribute('aria-label', registered ? 'Your SheaBliss account' : 'Sign in or create a SheaBliss account');
  });
  document.querySelectorAll('[data-wishlist-link]').forEach((link) => { link.hidden = !registered; });
  if (owner !== activeOwner || !registered) {
    activeOwner = owner;
    savedRevision += 1;
    savedProducts.clear();
    pendingWishlist = null;
    updateHeartButtons();
  }
}
document.addEventListener('customer-session-changed', (event) => updateAccountLinks(event.detail));

export async function loadWishlist(force = false) {
  const current = await getCustomerSession(force);
  if (!current.authenticated || !current.registered) return [];
  const owner = current.user.id;
  const revision = customerSnapshot().revision;
  if (!force && pendingWishlist) return pendingWishlist;
  const before = savedRevision;
  const request = accountRequest('wishlist').then((result) => {
    if (!isCurrentCustomer(owner, revision)) return [];
    if (before !== savedRevision) return currentItems();
    savedProducts = new Set((result.items || []).map((item) => item.product));
    updateHeartButtons();
    return currentItems();
  }).finally(() => { if (pendingWishlist === request) pendingWishlist = null; });
  pendingWishlist = request;
  return request;
}
function announce(message) {
  let notice = document.querySelector('.wishlist-status');
  if (!notice) {
    notice = document.createElement('p'); notice.className = 'wishlist-status'; notice.setAttribute('role', 'status'); document.body.append(notice);
  }
  notice.textContent = message;
  clearTimeout(announce.timeout);
  announce.timeout = setTimeout(() => { notice.textContent = ''; }, 4200);
}
export function clearPendingWishlist() {
  try { sessionStorage.removeItem('sheabliss-pending-wishlist'); } catch { /* No persistent customer data. */ }
}
export async function savePendingWishlist() {
  let product;
  try { product = sessionStorage.getItem('sheabliss-pending-wishlist'); } catch { return; }
  if (!product || !CATALOG.some((item) => item.product === product)) return;
  const current = await getCustomerSession();
  if (!current.authenticated || !current.registered) return;
  const owner = current.user.id;
  const revision = customerSnapshot().revision;
  const result = await accountRequest('wishlist', 'PUT', { product });
  if (!isCurrentCustomer(owner, revision)) return;
  savedRevision += 1;
  savedProducts = new Set((result.items || []).map((item) => item.product));
  clearPendingWishlist(); updateHeartButtons();
  announce(`${getProductName(product)} is saved to your wishlist.`);
}
document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-wishlist-product]') : null;
  if (!button) return;
  event.preventDefault(); event.stopPropagation();
  if (button.disabled) return;
  const product = button.dataset.wishlistProduct;
  button.disabled = true;
  try {
    const current = await getCustomerSession(true);
    if (!current.authenticated || !current.registered) {
      try { sessionStorage.setItem('sheabliss-pending-wishlist', product); } catch { /* The account invitation remains available. */ }
      location.assign('/account.html?reason=wishlist'); return;
    }
    const owner = current.user.id;
    const revision = customerSnapshot().revision;
    await loadWishlist();
    if (!isCurrentCustomer(owner, revision)) return;
    const removing = savedProducts.has(product);
    const result = await accountRequest('wishlist', removing ? 'DELETE' : 'PUT', { product });
    if (!isCurrentCustomer(owner, revision)) return;
    savedRevision += 1;
    savedProducts = new Set((result.items || []).map((item) => item.product));
    updateHeartButtons();
    announce(removing ? `${getProductName(product)} removed from your wishlist.` : `${getProductName(product)} saved to your wishlist.`);
    document.dispatchEvent(new CustomEvent('wishlist-changed', { detail: currentItems() }));
  } catch (error) { announce(error.message); }
  finally { button.disabled = false; }
});
getCustomerSession().then((current) => {
  updateAccountLinks(current);
  if (current.authenticated && current.registered) return loadWishlist();
}).catch(() => { /* Fail closed: no wishlist without a verified registered session. */ });
window.addEventListener('pageshow', (event) => {
  if (event.persisted) getCustomerSession(true).then((current) => {
    updateAccountLinks(current);
    if (current.authenticated && current.registered) return loadWishlist(true);
  }).catch(() => updateAccountLinks({ authenticated: false, registered: false }));
});
