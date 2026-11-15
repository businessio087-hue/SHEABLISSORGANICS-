import './navigation.js';
import { CATALOG } from '../shared/catalog.mjs';
import { getCustomerSession, customerSnapshot, isCurrentCustomer } from './customer-session.js';
import { catalogProductCard, loadWishlist, updateHeartButtons, savePendingWishlist } from './wishlist.js';

const gate = document.querySelector('#wishlist-gate');
const content = document.querySelector('#wishlist-content');
const grid = document.querySelector('#saved-products');
const status = document.querySelector('#wishlist-page-status');
let renderGeneration = 0;
let renderOwner;
let renderRevision;
function renderItems(items) {
  const saved = new Set(items.map((item) => item.product));
  const products = CATALOG.filter((item) => saved.has(item.product));
  grid.innerHTML = products.length ? products.map((item) => catalogProductCard(item, { saved: true })).join('') : '<div class="wishlist-empty"><h2>Your wishlist is quiet for now.</h2><p>Tap a product heart to keep a ritual here.</p><a class="line-link" href="/shop.html">Explore the shop</a></div>';
  updateHeartButtons();
}
function hideWishlist() {
  renderGeneration += 1;
  renderOwner = null;
  content.hidden = true; gate.hidden = false; grid.replaceChildren();
}
function unavailable(error) { hideWishlist(); status.textContent = error.message; }
document.addEventListener('customer-session-changed', (event) => {
  const current = event.detail;
  if (!current.authenticated || !current.registered) hideWishlist();
  else if (renderOwner && !isCurrentCustomer(renderOwner, renderRevision)) {
    hideWishlist(); queueMicrotask(() => renderPage().catch(unavailable));
  }
});
document.addEventListener('wishlist-changed', (event) => {
  if (!content.hidden && isCurrentCustomer(renderOwner, renderRevision)) renderItems(event.detail);
});
async function renderPage() {
  const generation = ++renderGeneration;
  const current = await getCustomerSession();
  if (!current.authenticated || !current.registered) { hideWishlist(); return; }
  const owner = current.user.id;
  const revision = customerSnapshot().revision;
  renderOwner = owner; renderRevision = revision;
  try { await savePendingWishlist(); } catch (error) { status.textContent = `Your wishlist remains available. ${error.message}`; }
  const items = await loadWishlist(true);
  if (generation !== renderGeneration || !isCurrentCustomer(owner, revision)) return;
  renderItems(items); gate.hidden = true; content.hidden = false;
}
renderPage().catch(unavailable);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) getCustomerSession(true).then(renderPage).catch(unavailable);
});
