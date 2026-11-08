import { CATALOG } from '../shared/catalog.mjs';

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const money = (value) => `R${Number(value).toLocaleString('en-ZA')}`;
const productKey = new URLSearchParams(window.location.search).get('product');
const product = CATALOG.find((entry) => slugify(entry.product) === productKey) || CATALOG[0];
const byId = (id) => document.getElementById(id);
const images = {
  'Organic Sheabutter': ['/assets/shelf-sheabliss-branded.png', '/assets/about-hands.webp', '/assets/batooro-culture.webp'],
  'Hair Butter': ['/assets/hair-butter-product.webp', '/assets/shelf-sheabliss-branded.png', '/assets/about-hands.webp'],
  'Mucuna Puriens (Beans)': ['/assets/about-hands.webp', '/assets/shelf-sheabliss-branded.png', '/assets/batooro-culture.webp'],
};
const details = {
  'Organic Sheabutter': { tagline: 'A rich, unrefined butter for skin that wants to feel held.', benefits: ['Deep, lasting moisture for dry skin', 'Raw shea butter with a bright citronelle note', 'A generous everyday body-care ritual'], ingredients: 'Unrefined shea butter, raw shea butter, citronelle.' },
  'Hair Butter': { tagline: 'A soft, nourishing blend for the hair ritual you return to.', benefits: ['Comforting moisture for hair and scalp', 'A rich blend with avocado and cocoa butter', 'Designed for a smooth, conditioned finish'], ingredients: 'Organic shea butter, avocado oil, cocoa butter.' },
  'Mucuna Puriens (Beans)': { tagline: 'Organically grown nootropic beans for clear-minded mornings.', benefits: ['A considered addition to wellness routines', 'Organically grown and carefully selected', 'A grounding pantry essential'], ingredients: 'Organically grown Mucuna pruriens beans.' },
};
const copy = details[product.product];
const gallery = images[product.product];
const mainImage = byId('product-main-image');
const variants = byId('product-variant');
const quantity = byId('product-quantity');
let selectedQuantity = 1;
let selectedVariant = product.variants[0];

byId('breadcrumb-product').textContent = product.product;
byId('product-category').textContent = `RITUAL / ${product.category.toUpperCase()}`;
byId('product-name').textContent = product.product;
byId('product-tagline').textContent = copy.tagline;
byId('product-reviews').textContent = product.product === 'Organic Sheabutter' ? '4.9 / 38 reviews' : '5.0 / 24 reviews';
byId('product-description').textContent = product.description;
byId('product-ingredients').textContent = copy.ingredients;
byId('product-benefits-list').innerHTML = copy.benefits.map((benefit) => `<li>${benefit}</li>`).join('');
mainImage.src = gallery[0];
mainImage.alt = `${product.product} product photograph`;
byId('product-price').textContent = money(selectedVariant.amountZar);
variants.innerHTML = product.variants.map((variant, index) => `<option value="${variant.size}" ${index === 0 ? 'selected' : ''}>${variant.size} — ${money(variant.amountZar)}</option>`).join('');

gallery.forEach((src, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `product-thumbnail${index === 0 ? ' is-selected' : ''}`; button.setAttribute('aria-label', `View product image ${index + 1}`);
  button.innerHTML = `<img src="${src}" alt="" />`;
  button.addEventListener('click', () => { mainImage.src = src; document.querySelectorAll('.product-thumbnail').forEach((item) => item.classList.remove('is-selected')); button.classList.add('is-selected'); });
  byId('product-thumbnails').append(button);
});

variants.addEventListener('change', () => { selectedVariant = product.variants.find((variant) => variant.size === variants.value) || product.variants[0]; byId('product-price').textContent = money(selectedVariant.amountZar); });
byId('quantity-minus').addEventListener('click', () => { selectedQuantity = Math.max(1, selectedQuantity - 1); quantity.value = selectedQuantity; });
byId('quantity-plus').addEventListener('click', () => { selectedQuantity = Math.min(99, selectedQuantity + 1); quantity.value = selectedQuantity; });
byId('zoom-button').addEventListener('click', () => { mainImage.closest('.product-gallery-main').classList.toggle('is-zoomed'); });

const getCart = () => { try { return JSON.parse(localStorage.getItem('sheabliss-cart') || '[]'); } catch { return []; } };
const saveCart = (cart) => { try { localStorage.setItem('sheabliss-cart', JSON.stringify(cart)); } catch {} };
const addCurrentToCart = () => { const cart = getCart(); const price = money(selectedVariant.amountZar); const existing = cart.find((item) => item.product === product.product && item.size === selectedVariant.size && item.price === price); if (existing) existing.quantity += selectedQuantity; else cart.push({ product: product.product, size: selectedVariant.size, price, amount: selectedVariant.amountZar, quantity: selectedQuantity }); saveCart(cart); byId('product-feedback').textContent = `${product.product} added to your bag.`; byId('product-bag-count').textContent = `(${cart.reduce((sum, item) => sum + item.quantity, 0)})`; return cart; };
byId('add-product-to-bag').addEventListener('click', addCurrentToCart);
byId('buy-product-now').addEventListener('click', () => { addCurrentToCart(); window.location.href = '/?openBag=1'; });
const wishlistKey = `sheabliss-wishlist-${slugify(product.product)}`;
const wishlistButton = byId('wishlist-button');
const updateWishlist = () => { const active = localStorage.getItem(wishlistKey) === 'true'; wishlistButton.setAttribute('aria-pressed', String(active)); wishlistButton.firstChild.textContent = active ? '♥ ' : '♡ '; };
wishlistButton.addEventListener('click', () => { const active = localStorage.getItem(wishlistKey) !== 'true'; localStorage.setItem(wishlistKey, String(active)); updateWishlist(); });
updateWishlist();
byId('product-bag-count').textContent = `(${getCart().reduce((sum, item) => sum + item.quantity, 0)})`;
