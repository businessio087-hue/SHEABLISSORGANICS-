import {
  CATALOG,
  getProductCategories,
  getProductMaterials,
  getProductName,
  getProductRanges,
  getStartingPrice,
  getValidVariants,
} from '../shared/catalog.mjs';
import { getRawMaterial } from '../shared/raw-materials.mjs';
import { SEARCH_CHIPS, SEARCH_KEYWORDS, SEARCH_SYNONYMS } from '../shared/search-keywords.mjs';

const WHATSAPP_URL = 'https://wa.me/27645382348';
const PRODUCT_ROUTES = {
  'organic-sheabutter': '/shop/organic-shea-butter/',
  'hair-butter': '/shop/hair-butter/',
  'mucuna-puriens-beans': '/shop/mucuna-pruriens-beans/',
};
const PRODUCT_IMAGES = {
  'hair-butter': '/assets/hair-butter-product.webp',
  'organic-sheabutter': '/assets/shelf-sheabliss-branded.png',
  'mucuna-puriens-beans': '/assets/shelf-sheabliss-branded.png',
};
const CATEGORY_TERMS = {
  body: ['body', 'organic-sheabutter'],
  skin: ['skin', 'organic-sheabutter'],
  hair: ['hair', 'hair-butter'],
  health: ['health', 'mucuna-puriens-beans'],
  wellness: ['health', 'mucuna-puriens-beans'],
};
const POPULAR_IDS = ['organic-sheabutter', 'hair-butter', 'mucuna-puriens-beans'];

export const normalizeSearchText = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const singularize = (token) => token.length > 4 && token.endsWith('s') && !token.endsWith('us') ? token.slice(0, -1) : token;
const tokens = (value) => normalizeSearchText(value).split(/\s+/).filter(Boolean).map(singularize);
const synonymTokens = (value) => tokens(value).map((token) => SEARCH_SYNONYMS[token] || token);

const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};

const codeFor = (item) => String(item?.sku || item?.code || item?.id || item?.product || '').trim();
const routeFor = (item) => PRODUCT_ROUTES[item?.id] || `/shop/?q=${encodeURIComponent(getProductName(item))}`;
const imageFor = (item) => item?.image || item?.imageUrl || PRODUCT_IMAGES[item?.id] || '/assets/shelf-sheabliss-branded.png';
const priceFor = (item) => getStartingPrice(item);
const priceLabelFor = (item) => {
  const variants = getValidVariants(item);
  if (!variants.length) return 'Price to be confirmed';
  const amounts = [...new Set(variants.map((variant) => variant.amountZar))];
  return amounts.length === 1 ? `R${amounts[0].toLocaleString('en-ZA')}` : `from R${Math.min(...amounts).toLocaleString('en-ZA')}`;
};

const searchableFieldsFor = (item) => {
  const materials = getProductMaterials(item).map((id) => getRawMaterial(id)?.name || id);
  return [
    getProductName(item), item.product, item.description, item.suitableFor, item.bodyPart,
    item.benefits, item.category, ...getProductCategories(item), ...getProductRanges(item),
    ...materials, ...(SEARCH_KEYWORDS[item.id] || []), codeFor(item),
  ].filter(Boolean).map(normalizeSearchText);
};

const scoreProduct = (item, query) => {
  const normalized = normalizeSearchText(query);
  const queryTokens = synonymTokens(query);
  const code = normalizeSearchText(codeFor(item));
  const name = normalizeSearchText(getProductName(item));
  const fields = searchableFieldsFor(item);
  const keywordFields = (SEARCH_KEYWORDS[item.id] || []).map(normalizeSearchText);
  const fieldTokens = [...new Set(fields.flatMap((field) => field.split(' ')))];
  let score = 0;
  let exactSignal = false;

  if (code && normalized === code) { score += 1400; exactSignal = true; }
  else if (code && code.includes(normalized) && normalized.length >= 2) { score += 980; exactSignal = true; }
  if (name === normalized) { score += 1100; exactSignal = true; }
  else if (name.includes(normalized) && normalized.length >= 2) { score += 760; exactSignal = true; }

  queryTokens.forEach((token) => {
    if (!token) return;
    const category = CATEGORY_TERMS[token];
    if (category?.includes(item.id)) score += 410;
    if (keywordFields.some((keyword) => keyword === token || keyword.startsWith(`${token} `) || keyword.endsWith(` ${token}`))) {
      score += 330;
      exactSignal = true;
      return;
    }
    if (fields.some((field) => field === token || field.includes(` ${token} `) || field.startsWith(`${token} `) || field.endsWith(` ${token}`))) {
      score += 270;
      exactSignal = true;
      return;
    }
    if (fieldTokens.some((fieldToken) => fieldToken.startsWith(token) || token.startsWith(fieldToken))) {
      score += 145;
      return;
    }
    const nearest = fieldTokens.reduce((best, fieldToken) => Math.min(best, editDistance(token, fieldToken)), 99);
    const threshold = token.length >= 6 ? 2 : 1;
    if (nearest <= threshold) score += 115;
  });

  const underMatch = normalized.match(/(?:under|below|less than|max(?:imum)?)\s*r?\s*(\d+)/);
  if (underMatch) {
    const limit = Number(underMatch[1]);
    const price = priceFor(item);
    score += price !== null && price <= limit ? 420 : -180;
  }
  if (queryTokens.includes('low') || queryTokens.includes('price')) {
    score += priceFor(item) === null ? -80 : Math.max(0, 160 - priceFor(item) / 5);
  }
  if (queryTokens.includes('gift')) score += 90;
  return { score, exactSignal };
};

export const rankProducts = (query, products = CATALOG) => {
  const normalized = normalizeSearchText(query);
  if (!normalized) return { results: [], strong: false };
  const ranked = products.map((item) => ({ item, ...scoreProduct(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (priceFor(a.item) ?? 999999) - (priceFor(b.item) ?? 999999));
  const strong = ranked.some((entry) => entry.exactSignal && entry.score >= 250) || ranked[0]?.score >= 300;
  return { results: ranked, strong };
};

export const popularProducts = (products = CATALOG) => {
  const byId = new Map(products.map((item) => [item.id, item]));
  return POPULAR_IDS.map((id) => byId.get(id)).filter(Boolean);
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
const cardMarkup = (item, { best = false } = {}) => {
  const name = getProductName(item);
  const variants = getValidVariants(item);
  const size = variants[0]?.size || 'See product details';
  const sku = codeFor(item);
  return `<button class="smart-search-result${best ? ' smart-search-result-best' : ''}" type="button" role="option" data-search-href="${escapeHtml(routeFor(item))}" aria-label="Open ${escapeHtml(name)}">
    <img src="${escapeHtml(imageFor(item))}" alt="" loading="lazy" />
    <span class="smart-search-result-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(size)} · ${escapeHtml(priceLabelFor(item))}</span><small>SKU: ${escapeHtml(sku)}</small></span>
    ${best ? '<span class="smart-search-best-label">Best match</span>' : ''}
  </button>`;
};

const logNoStrongMatch = (query) => {
  const clean = String(query || '').trim().slice(0, 120);
  if (!clean) return;
  console.info('[SheaBliss search] no strong match', clean);
  try {
    const key = 'sheabliss-search-no-match';
    const previous = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([...previous.filter((entry) => entry !== clean), clean].slice(-100)));
  } catch { /* Private browsing or disabled storage: the console log is sufficient. */ }
};

export function initProductSearch(root) {
  if (!root) return;
  const input = root.querySelector('input[type="search"]');
  const list = root.querySelector('[data-search-suggestions]');
  const hint = root.querySelector('[data-search-hint]');
  if (!input || !list) return;
  let timer;
  let entries = [];
  let activeIndex = -1;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  const openBest = () => {
    const target = entries[0]?.item;
    if (target) window.location.assign(routeFor(target));
  };
  const setOpen = (open) => {
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
  };
  const renderChips = () => {
    list.innerHTML = `<div class="smart-search-empty"><span class="smart-search-empty-label">Try a ritual</span><div class="smart-search-chips">${SEARCH_CHIPS.map((chip) => `<button type="button" class="smart-search-chip" data-search-chip="${escapeHtml(chip.query)}">${escapeHtml(chip.label)}</button>`).join('')}</div></div>`;
    setOpen(true);
  };
  const render = (query) => {
    const clean = query.trim();
    if (clean.length < 2) { entries = []; activeIndex = -1; renderChips(); return; }
    const ranked = rankProducts(clean);
    entries = ranked.strong ? ranked.results.slice(0, 3) : popularProducts().map((item) => ({ item, score: 0, exactSignal: false }));
    if (!ranked.strong) logNoStrongMatch(clean);
    const heading = ranked.strong ? 'Product suggestions' : 'Not sure what you need? Here are our most popular picks';
    const fallback = ranked.strong ? '' : `<a class="smart-search-whatsapp" href="${WHATSAPP_URL}" target="_blank" rel="noopener">Ask us on WhatsApp</a>`;
    list.innerHTML = `<div class="smart-search-heading">${escapeHtml(heading)}</div><div class="smart-search-results">${entries.map((entry, index) => cardMarkup(entry.item, { best: ranked.strong && index === 0 })).join('')}</div>${fallback}`;
    activeIndex = -1;
    setOpen(true);
    if (hint) hint.textContent = entries[0] ? `Press Enter to open ${getProductName(entries[0].item)}` : 'Press Enter to search the full edit';
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => render(input.value), 150); };

  input.addEventListener('input', schedule);
  input.addEventListener('focus', () => { if (input.value.trim().length < 2) renderChips(); else schedule(); });
  input.addEventListener('keydown', (event) => {
    const options = [...list.querySelectorAll('[role="option"]')];
    if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, options.length - 1); options[activeIndex].focus(); }
    if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); options[activeIndex].focus(); }
    if (event.key === 'Escape') { setOpen(false); input.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'Enter' && !event.defaultPrevented && input.value.trim().length >= 2) { event.preventDefault(); openBest(); }
  });
  list.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-search-chip]');
    if (chip) { input.value = chip.dataset.searchChip; input.focus(); render(input.value); return; }
    const result = event.target.closest('[data-search-href]');
    if (result) window.location.assign(result.dataset.searchHref);
  });
  root.addEventListener('submit', (event) => {
    if (!input.value.trim()) return;
    event.preventDefault();
    if (input.value.trim().length >= 2) openBest();
  });
  document.addEventListener('click', (event) => { if (!root.contains(event.target)) setOpen(false); });
}
