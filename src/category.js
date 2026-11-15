import { CATALOG, CATEGORY_DEFINITIONS, getProductsByCategory, getProductRange, getProductRanges } from '../shared/catalog.mjs';
import './navigation.js';
import { catalogProductCard, updateHeartButtons } from './wishlist.js';

const params = new URLSearchParams(location.search);
const requestedCategory = params.get('category') || 'Body';
const requestedRange = params.get('range') || '';
const pageIsShop = location.pathname.endsWith('/shop.html');
const definition = CATEGORY_DEFINITIONS.find((item) => item.name.toLowerCase() === requestedCategory.toLowerCase());
const category = pageIsShop ? null : definition?.name;
const label = pageIsShop ? 'Shop' : category || 'Products';
const description = pageIsShop
  ? 'The complete edit. Explore our body, skin, hair and health catalog.'
  : definition?.description || 'Explore the SHEABLISS collection.';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
// Membership can overlap; a SKU remains one independent record in each view.
const baseProducts = [...new Map((pageIsShop ? CATALOG : category ? getProductsByCategory(category) : []).map((item) => [item.product, item])).values()];
const productRanges = (item) => category ? [getProductRange(item, category)] : getProductRanges(item);
const presentRanges = new Set(baseProducts.flatMap(productRanges).filter(Boolean));
const definedRanges = (pageIsShop ? CATEGORY_DEFINITIONS.flatMap((item) => item.subcategories) : definition?.subcategories || []).filter((range) => presentRanges.has(range));
const ranges = [...new Set([...definedRanges, ...presentRanges])];
const selectedRange = ranges.find((range) => range.toLowerCase() === requestedRange.toLowerCase());
const unknownRange = Boolean(requestedRange && !selectedRange);
const products = unknownRange ? [] : selectedRange ? baseProducts.filter((item) => productRanges(item).includes(selectedRange)) : baseProducts;

function catalogHref(categoryName = null, range = '') {
  const query = new URLSearchParams();
  if (categoryName) query.set('category', categoryName);
  if (range) query.set('range', range);
  return `${categoryName ? '/category.html' : '/shop.html'}${query.size ? `?${query}` : ''}`;
}

function navigationLink(text, href, current = false) {
  return `<a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a>`;
}

document.title = `${selectedRange ? `${selectedRange} — ` : ''}${label} — SHEABLISS ORGANICS`;
document.querySelector('#category-title').textContent = label;
document.querySelector('#category-description').textContent = description;
document.querySelector('meta[name="description"]').content = `${label} — ${description}`;
const breadcrumbs = document.querySelector('.category-main .breadcrumbs');
breadcrumbs.innerHTML = `<a href="/">Home</a><span aria-hidden="true">/</span>${pageIsShop
  ? requestedRange ? '<a id="category-breadcrumb" href="/shop.html">Shop</a>' : '<span id="category-breadcrumb" aria-current="page">Shop</span>'
  : `<a href="/shop.html">Shop</a><span aria-hidden="true">/</span>${requestedRange
    ? `<a id="category-breadcrumb" href="${escapeHtml(catalogHref(category))}">${escapeHtml(label)}</a>`
    : `<span id="category-breadcrumb" aria-current="page">${escapeHtml(label)}</span>`}`}${requestedRange ? `<span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(selectedRange || requestedRange)}</span>` : ''}`;

const container = document.querySelector('#category-products');
// Reuse Shop's existing visible navigation rather than creating a second copy.
let categoryNavigation = document.querySelector('.shop-category-navigation');
if (!categoryNavigation) {
  categoryNavigation = document.createElement('nav');
  categoryNavigation.className = 'shop-category-navigation';
  categoryNavigation.setAttribute('aria-label', 'Browse shop categories');
  container.before(categoryNavigation);
}
categoryNavigation.innerHTML = `<p class="eyebrow shop-category-label">Browse by category</p><div class="shop-category-links">${navigationLink('All products', '/shop.html', pageIsShop && !requestedRange)}${CATEGORY_DEFINITIONS.map((item) => {
  const supportedRange = selectedRange && getProductsByCategory(item.name).some((product) => getProductRange(product, item.name) === selectedRange) ? selectedRange : '';
  return navigationLink(item.name, catalogHref(item.name, supportedRange), category === item.name);
}).join('')}</div>`;

const rangeNavigation = document.createElement('nav');
rangeNavigation.className = 'catalog-range-navigation';
rangeNavigation.setAttribute('aria-label', 'Browse product types');
rangeNavigation.innerHTML = `<p class="eyebrow">Browse by product type</p><div class="catalog-range-links">${navigationLink('All products', catalogHref(category), !requestedRange)}${ranges.map((range) => navigationLink(range, catalogHref(category, range), selectedRange === range)).join('')}</div>`;
container.before(rangeNavigation);
const summary = document.createElement('p');
summary.className = 'catalog-results-summary';
summary.textContent = unknownRange ? `Product type “${requestedRange}” is not listed in this view.` : `${products.length} ${products.length === 1 ? 'product' : 'products'}${selectedRange ? ` / ${selectedRange}` : ''}`;
container.before(summary);

if (!products.length) {
  container.classList.add('category-empty');
  container.innerHTML = `<div class="category-empty-note"><h2>${unknownRange ? 'This product type is not listed here.' : 'This collection is not available.'}</h2><p>${unknownRange ? 'Choose another listed product type or reset the filter to see all products in this collection.' : 'Browse the current collection in the shop.'}</p><a class="line-link" href="${escapeHtml(unknownRange ? catalogHref(category) : '/shop.html')}">${unknownRange ? 'All products — reset filter' : 'Explore the shop'}</a></div>`;
} else {
  container.innerHTML = products.map((item, index) => catalogProductCard(item, { index, category })).join('');
  updateHeartButtons();
}
