import { SPREADSHEET_PRODUCTS } from './product-list.mjs';

export const CATEGORY_DEFINITIONS = [
  { name: 'Body', description: 'Grounding care for body and hands.', subcategories: ['Creams & Lotions', 'Body Butters', 'Hand Creams', 'Soaps', 'Oils', 'Soap-making Ingredients', 'Awaiting confirmation'] },
  { name: 'Skin', description: 'Face and lip care for your daily rituals.', subcategories: ['Face Creams', 'Lip Balms', 'Oils'] },
  { name: 'Hair', description: 'Nourishing care for the hair rituals you return to.', subcategories: ['Hair Butters', 'Hair Creams', 'Hair Oils'] },
  { name: 'Health', description: 'Thoughtful wellness essentials for everyday well-being.', subcategories: ['Wellness Essentials'] },
];

// Keep these established checkout/wishlist identifiers and confirmed prices intact.
// New spreadsheet formulas are separate products, never assumed to replace these.
const ESTABLISHED_PRODUCTS = [
  {
    id: 'organic-sheabutter', product: 'Organic Sheabutter', name: 'Organic Shea Butter',
    category: 'Body', categories: ['Body'],
    subcategory: 'Body Butters', productType: 'Body Butter',
    description: 'Unrefined shea butter, raw shea butter with citronelle.',
    status: 'active', needsReview: false,
    variants: [
      { size: '100g', amountZar: 100 },
      { size: '200g', amountZar: 180 },
      { size: '500g', amountZar: 380 },
      { size: '1kg', amountZar: 700 },
      { size: '5kg', amountZar: 3000 },
    ],
  },
  {
    id: 'hair-butter', product: 'Hair Butter', name: 'Hair Butter',
    category: 'Hair', categories: ['Hair'], subcategory: 'Hair Butters', productType: 'Hair Butter',
    description: 'Organic shea butter, avocado oil and cocoa butter blend.',
    status: 'active', needsReview: false,
    variants: [{ size: '250g', amountZar: 200 }],
  },
  {
    id: 'mucuna-puriens-beans', product: 'Mucuna Puriens (Beans)', name: 'Mucuna Puriens (Beans)',
    category: 'Health', categories: ['Health'], subcategory: 'Wellness Essentials', productType: 'Wellness Food',
    description: 'Organically grown nootropic beans.', status: 'active', needsReview: false,
    variants: [{ size: '100g', amountZar: 250 }, { size: '200g', amountZar: 150 }],
  },
];

export const CATALOG = [...ESTABLISHED_PRODUCTS, ...SPREADSHEET_PRODUCTS];

export function getProduct(key) {
  return CATALOG.find((item) => item.product === key || item.id === key);
}
const resolveProduct = (itemOrKey) => typeof itemOrKey === 'string' ? getProduct(itemOrKey) : itemOrKey;
export function getProductName(itemOrKey) {
  const item = resolveProduct(itemOrKey);
  return item?.name || item?.product || (typeof itemOrKey === 'string' ? itemOrKey : 'Product');
}
export function getProductCategories(item) {
  return item?.categories?.length ? [...new Set(item.categories)] : item ? [item.collection || item.category] : [];
}
export function getProductsByCategory(category) {
  return CATALOG.filter((item) => getProductCategories(item).includes(category));
}
export function getProductRange(item, category = item?.category) {
  return item?.categoryRanges?.[category] || item?.subcategory || '';
}
export function getProductRanges(item) {
  return [...new Set([item?.subcategory, ...Object.values(item?.categoryRanges || {})].filter(Boolean))];
}
function validVariant(variant) {
  const amount = variant?.amountZar;
  const cents = amount * 100;
  return typeof variant?.size === 'string' && Boolean(variant.size.trim())
    && typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    && Number.isSafeInteger(Math.round(cents)) && Math.abs(cents - Math.round(cents)) < 0.000001;
}
export function getValidVariants(itemOrKey) {
  const item = resolveProduct(itemOrKey);
  if (!item || item.status !== 'active' || item.needsReview || !Array.isArray(item.variants)) return [];
  return item.variants.filter(validVariant);
}
export function isPurchasable(itemOrKey) { return getValidVariants(itemOrKey).length > 0; }
export function getStartingPrice(itemOrKey) {
  const variants = getValidVariants(itemOrKey);
  return variants.length ? Math.min(...variants.map((variant) => variant.amountZar)) : null;
}
export function getAvailabilityLabel(itemOrKey) {
  const item = resolveProduct(itemOrKey);
  if (isPurchasable(item)) return 'Available to order';
  return item?.needsReview ? 'Product details being confirmed' : 'Sizes & pricing to be confirmed';
}

// Used by both saved-bag hydration and the Yoco backend. Unknown, unapproved,
// unpriced and review-pending products cannot become payment line items.
export function findVariant(productKey, size) {
  const product = getProduct(productKey);
  const variant = getValidVariants(product).find((entry) => entry.size === size);
  return product && variant ? { ...product, ...variant } : null;
}
