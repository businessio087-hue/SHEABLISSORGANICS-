import { CATALOG, CATEGORY_DEFINITIONS, getProductsByCategory, getProductRange, getProductRanges, getProductMaterials, getProductCategories } from '../shared/catalog.mjs';
import { RAW_MATERIALS, getRawMaterial } from '../shared/raw-materials.mjs';
import './navigation.js';
import { catalogProductCard, updateHeartButtons } from './wishlist.js';

const params = new URLSearchParams(location.search);
const requestedCategory = params.get('category') || 'Body';
const requestedRange = params.get('range') || '';
const requestedMaterial = params.get('material') || '';
const searchQuery = params.get('q')?.trim() || '';
const cleanSlug = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
const cleanCategory = { body: 'Body', hair: 'Hair', skin: 'Skin', health: 'Health' }[cleanSlug];
const pageIsShop = location.pathname === '/shop/' || location.pathname.endsWith('/shop.html');
const definition = CATEGORY_DEFINITIONS.find((item) => item.name.toLowerCase() === (cleanCategory || requestedCategory).toLowerCase());
const category = pageIsShop ? null : definition?.name;
const label = pageIsShop ? 'Shop' : category || 'Products';
const selectedMaterial = getRawMaterial(requestedMaterial);
const unknownMaterial = Boolean(requestedMaterial && !selectedMaterial);
const description = pageIsShop
  ? 'The complete edit. Explore our body, skin, hair and health catalog.'
  : definition?.description || 'Explore the SHEABLISS collection.';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const hasMaterial = (item, id) => !id || getProductMaterials(item).includes(id);
// Category and ingredient memberships overlap, but each SKU appears only once.
const categoryProducts = [...new Map((pageIsShop ? CATALOG : category ? getProductsByCategory(category) : []).map((item) => [item.product, item])).values()];
const baseProducts = unknownMaterial ? [] : categoryProducts.filter((item) => hasMaterial(item, selectedMaterial?.id));
const searchableText = (item) => [item.product, item.description, ...getProductCategories(item), ...getProductRanges(item), ...getProductMaterials(item).map((id) => getRawMaterial(id)?.name || id)].filter(Boolean).join(' ').toLowerCase();
const searchedProducts = searchQuery ? baseProducts.filter((item) => searchableText(item).includes(searchQuery.toLowerCase())) : baseProducts;
const productRanges = (item) => category ? [getProductRange(item, category)] : getProductRanges(item);
const presentRanges = new Set(searchedProducts.flatMap(productRanges).filter(Boolean));
const definedRanges = (pageIsShop ? CATEGORY_DEFINITIONS.flatMap((item) => item.subcategories) : definition?.subcategories || []).filter((range) => presentRanges.has(range));
const ranges = [...new Set([...definedRanges, ...presentRanges])];
const selectedRange = ranges.find((range) => range.toLowerCase() === requestedRange.toLowerCase());
const unknownRange = Boolean(requestedRange && !selectedRange);
const products = unknownRange || unknownMaterial ? [] : selectedRange ? searchedProducts.filter((item) => productRanges(item).includes(selectedRange)) : searchedProducts;

function catalogHref(categoryName = null, range = '', material = selectedMaterial?.id || '') {
  const query = new URLSearchParams();
  if (categoryName) query.set('category', categoryName);
  if (range) query.set('range', range);
  if (material) query.set('material', material);
  const base = categoryName ? `/${{ Body: 'body', Hair: 'hair', Skin: 'skin', Health: 'health' }[categoryName] || 'category.html'}/` : '/shop/';
  return `${base}${query.size ? `?${query}` : ''}`;
}
function navigationLink(text, href, current = false) {
  return `<a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a>`;
}

const activeFilter = Boolean(requestedRange || requestedMaterial || searchQuery);
document.title = `${searchQuery ? `Search: ${searchQuery} — ` : ''}${selectedMaterial ? `${selectedMaterial.name} — ` : ''}${selectedRange ? `${selectedRange} — ` : ''}${label} — SHEABLISS ORGANICS`;
document.querySelector('#category-title').textContent = label;
document.querySelector('#category-description').textContent = description;
document.querySelector('meta[name="description"]').content = `${label} — ${selectedMaterial ? `${selectedMaterial.name}. ` : ''}${description}`;
const canonicalHref = pageIsShop ? 'https://sheabliss.co.za/shop/' : `https://sheabliss.co.za/${{ Body: 'body', Hair: 'hair', Skin: 'skin', Health: 'health' }[category] || 'category.html'}/`;
let canonical = document.querySelector('link[rel="canonical"]');
if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head?.append(canonical); }
canonical.href = canonicalHref;
const breadcrumbs = document.querySelector('.category-main .breadcrumbs');
const crumbs = ['<a href="/">Home</a>'];
if (pageIsShop) {
  crumbs.push(activeFilter ? '<a id="category-breadcrumb" href="/shop/">Shop</a>' : '<span id="category-breadcrumb" aria-current="page">Shop</span>');
} else {
  crumbs.push('<a href="/shop/">Shop</a>');
  crumbs.push(activeFilter ? `<a id="category-breadcrumb" href="${escapeHtml(catalogHref(category, '', ''))}">${escapeHtml(label)}</a>` : `<span id="category-breadcrumb" aria-current="page">${escapeHtml(label)}</span>`);
}
if (requestedRange) {
  crumbs.push(requestedMaterial ? `<a href="${escapeHtml(catalogHref(category, selectedRange || requestedRange, ''))}">${escapeHtml(selectedRange || requestedRange)}</a>` : `<span aria-current="page">${escapeHtml(selectedRange || requestedRange)}</span>`);
}
if (requestedMaterial) crumbs.push(`<span aria-current="page">${escapeHtml(selectedMaterial?.name || requestedMaterial)}</span>`);
breadcrumbs.innerHTML = crumbs.join('<span aria-hidden="true">/</span>');

const container = document.querySelector('#category-products');
let categoryNavigation = document.querySelector('.shop-category-navigation');
if (!categoryNavigation) {
  categoryNavigation = document.createElement('nav');
  categoryNavigation.className = 'shop-category-navigation';
  categoryNavigation.setAttribute('aria-label', 'Browse shop categories');
  container.before(categoryNavigation);
}
categoryNavigation.innerHTML = `<p class="eyebrow shop-category-label">Browse by category</p><div class="shop-category-links">${navigationLink('All products', catalogHref(null, selectedRange || '', selectedMaterial?.id || ''), pageIsShop && !activeFilter)}${CATEGORY_DEFINITIONS.map((item) => {
  const targetProducts = getProductsByCategory(item.name);
  const material = selectedMaterial && targetProducts.some((product) => hasMaterial(product, selectedMaterial.id)) ? selectedMaterial.id : '';
  const supportedRange = selectedRange && targetProducts.some((product) => hasMaterial(product, material) && getProductRange(product, item.name) === selectedRange) ? selectedRange : '';
  return navigationLink(item.name, catalogHref(item.name, supportedRange, material), category === item.name);
}).join('')}</div>`;

const rangeNavigation = document.createElement('nav');
rangeNavigation.className = 'catalog-range-navigation';
rangeNavigation.setAttribute('aria-label', 'Browse product types');
rangeNavigation.innerHTML = `<p class="eyebrow">Browse by product type</p><div class="catalog-range-links">${navigationLink('All products', catalogHref(category), !requestedRange)}${ranges.map((range) => navigationLink(range, catalogHref(category, range), selectedRange === range)).join('')}</div>`;
container.before(rangeNavigation);

const availableMaterials = RAW_MATERIALS.filter((material) => categoryProducts.some((product) => hasMaterial(product, material.id)));
if (availableMaterials.length || requestedMaterial) {
  const materialNavigation = document.createElement('nav');
  materialNavigation.className = 'catalog-range-navigation catalog-material-navigation';
  materialNavigation.setAttribute('aria-label', 'Browse by ingredient');
  materialNavigation.innerHTML = `<p class="eyebrow">Browse by ingredient</p><div class="catalog-range-links">${navigationLink('All ingredients', catalogHref(category, selectedRange || '', ''), !requestedMaterial)}${availableMaterials.map((material) => {
    const compatibleRange = selectedRange && categoryProducts.some((item) => hasMaterial(item, material.id) && productRanges(item).includes(selectedRange)) ? selectedRange : '';
    return navigationLink(material.name, catalogHref(category, compatibleRange, material.id), selectedMaterial?.id === material.id);
  }).join('')}</div>`;
  container.before(materialNavigation);
}
if (selectedMaterial) {
  const note = document.createElement('p');
  note.className = 'catalog-material-note';
  note.textContent = `Ingredient family: ${selectedMaterial.name}. These matches follow the supplied product names and recipes; plant parts and preparations may differ.`;
  container.before(note);
}
const summary = document.createElement('p');
summary.className = 'catalog-results-summary';
summary.textContent = unknownMaterial ? `Ingredient “${requestedMaterial}” is not listed.` : unknownRange ? `Product type “${requestedRange}” is not listed in this view.` : `${products.length} ${products.length === 1 ? 'product' : 'products'}${searchQuery ? ` matching “${searchQuery}”` : ''}${selectedRange ? ` / ${selectedRange}` : ''}${selectedMaterial ? ` / ${selectedMaterial.name}` : ''}`;
container.before(summary);

if (!products.length) {
  container.classList.add('category-empty');
  const invalid = unknownRange || unknownMaterial;
  const title = unknownMaterial ? 'This ingredient is not listed.' : unknownRange ? 'This product type is not listed here.' : searchQuery ? `No rituals match “${searchQuery}”.` : 'No products match this selection.';
  const note = invalid ? 'Choose a listed ingredient or product type, or reset the filter to see the collection.' : searchQuery ? 'Try another search, or explore the complete collection.' : 'Try another ingredient, product type or category.';
  const reset = invalid ? catalogHref(category) : catalogHref(category, '', '');
  container.innerHTML = `<div class="category-empty-note"><h2>${title}</h2><p>${note}</p><a class="line-link" href="${escapeHtml(reset)}">${invalid ? 'All products — reset filter' : 'Explore the collection'}</a></div>`;
} else {
  container.innerHTML = products.map((item, index) => catalogProductCard(item, { index, category, material: selectedMaterial?.id })).join('');
  updateHeartButtons();
}
