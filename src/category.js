import { CATALOG } from '../shared/catalog.mjs';
import './navigation.js';
import { heartButton, updateHeartButtons } from './wishlist.js';

const requestedCategory = new URLSearchParams(location.search).get('category') || 'Body';
const pageIsShop = location.pathname.endsWith('/shop.html');
const category = pageIsShop ? 'Shop' : ['Body', 'Hair', 'Skin', 'Health'].find((value) => value.toLowerCase() === requestedCategory.toLowerCase());
const label = category || 'Products';
// The display collection keeps Body independent from the new Skin range.
// Existing internal checkout categories and product prices remain unchanged.
const products = pageIsShop ? CATALOG : CATALOG.filter((item) => (item.collection || item.category) === category);
const descriptions = {
  Shop: 'The complete edit. Grounding care for body, hair and everyday well-being.',
  Body: 'Rich, grounding care for the skin you live in.',
  Hair: 'Nourishing blends for the hair rituals you return to.',
  Skin: 'A space for your daily skincare rituals.',
  Health: 'Thoughtful wellness essentials for clear-minded mornings.',
};

function displayCategory(item) {
  return item.collection || item.category;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
document.title = `${label} — SHEABLISS ORGANICS`;
document.querySelector('#category-breadcrumb').textContent = label;
document.querySelector('#category-title').textContent = label;
document.querySelector('#category-description').textContent = descriptions[label] || 'Explore the SHEABLISS collection.';
document.querySelector('meta[name="description"]').content = `${label} — ${descriptions[label] || 'Explore the SHEABLISS collection.'}`;

const container = document.querySelector('#category-products');
if (!products.length) {
  container.classList.add('category-empty');
  container.innerHTML = `<div class="category-empty-note"><h2>${category === 'Skin' ? 'Our Skin collection is not listed yet.' : 'This collection is not available.'}</h2><p>${category === 'Skin' ? 'Discover our current body care, hair care and wellness products in the shop.' : 'Browse the current collection in the shop.'}</p><a class="line-link" href="/shop.html">Explore the shop</a></div>`;
} else {
  container.innerHTML = products.map((item, index) => `<article class="category-product category-product-${escapeHtml(item.category.toLowerCase())}">${heartButton(item.product)}<span class="product-index">${String(index + 1).padStart(2, '0')} / ${displayCategory(item).toUpperCase()}</span><div class="category-product-object"><span>${escapeHtml(item.product)}</span></div><p class="category-product-note">${escapeHtml(item.description)}</p><h2>${escapeHtml(item.product)}</h2><strong>from R${Math.min(...item.variants.map((variant) => variant.amountZar)).toLocaleString('en-ZA')}</strong></article>`).join('');
  updateHeartButtons();
}
