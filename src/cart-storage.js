import { findVariant } from '../shared/catalog.mjs';

const storageKey = 'sheabliss-cart-v1';

export function readBag() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    const items = new Map();
    for (const item of saved) {
      if (!item || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue;
      const variant = findVariant(item.product, item.size);
      if (!variant) continue;
      const key = `${variant.product}\u0000${variant.size}`;
      const quantity = (items.get(key)?.quantity || 0) + item.quantity;
      if (!Number.isSafeInteger(quantity)) continue;
      items.set(key, {
        product: variant.product,
        size: variant.size,
        price: `R${variant.amountZar.toLocaleString('en-ZA')}`,
        amount: variant.amountZar,
        quantity,
      });
    }
    return [...items.values()];
  } catch {
    return [];
  }
}

export function saveBag(items) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.map(({ product, size, quantity }) => ({ product, size, quantity }))));
  } catch { /* Current-page purchasing remains usable when storage is blocked. */ }
}
